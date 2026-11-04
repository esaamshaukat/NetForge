// Your progress: saved on this device first (works offline), then merged with
// Firestore in the background (users/{uid}/sync/{stats|cards|flags|history|settings|sessions}).
//
// Rules that keep progress safe:
//  * merging never deletes: for each question / card / flag the NEWEST entry wins
//  * history is a union of both sides, a "reset" only removes entries older than the reset
//  * writes are batched (every ~4 s, sessions every ~20 s) and sent when the tab is hidden
//  * each document is stored as ONE JSON string field => tiny index, far below free-plan limits
import { db, doc, runTransaction } from './auth.js';
import { dayStart } from './util.js';

const NAMES = ['stats', 'cards', 'flags', 'history', 'settings', 'sessions'];   // stats first (history uses its resetAt)
const emptyDoc = n => ({ stats: { resetAt: 0, q: {} }, cards: {}, flags: {}, history: [], settings: { ts: 0 }, sessions: {} }[n]);
const emptyState = () => Object.fromEntries(NAMES.map(n => [n, emptyDoc(n)]));

export const L = { uid: null, s: emptyState(), dirty: {}, m: {} };   // s = progress, dirty = not yet in Firestore, m = local-only notes

// ------------------------------------------------------------------ merging (pure)
const tsOf = x => (x && x.ts) || 0;
function mergeMap(a, b) {
  const o = Object.assign({}, a);
  for (const k in b) if (!(k in o) || tsOf(b[k]) > tsOf(o[k])) o[k] = b[k];
  return o;
}
export function mergeStats(a, b) {
  const resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);
  const q = mergeMap(a.q || {}, b.q || {});
  if (resetAt) for (const k in q) if (tsOf(q[k]) <= resetAt) delete q[k];
  return { resetAt, q };
}
export function mergeHist(a, b, resetAt = 0) {
  const m = new Map();
  [...(b || []), ...(a || [])].forEach(h => h && h.t && m.set(h.t + '|' + h.mode, h));   // local copy wins a tie
  return [...m.values()].filter(h => h.t > resetAt).sort((x, y) => x.t - y.t).slice(-200);
}
export function mergeDoc(n, a, b) {
  if (n === 'stats') return mergeStats(a, b);
  if (n === 'history') return mergeHist(a, b, (L.s.stats || {}).resetAt || 0);
  if (n === 'settings') return tsOf(b) > tsOf(a) ? b : a;
  return mergeMap(a, b);   // cards, flags, sessions
}
function eq(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => eq(a[k], b[k]));
}
function parse(txt, n) {
  try { const v = JSON.parse(txt); if (v && typeof v === 'object') return v; } catch (e) { /* fall through */ }
  return emptyDoc(n);
}

// ------------------------------------------------------------------ local storage (IndexedDB)
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open('encor-app', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function idbGet(k) { try { const d = await idb(); return await new Promise(res => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } }
async function idbSet(k, v) { try { const d = await idb(); return await new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(true); t.onerror = t.onabort = () => res(false); }); } catch (e) { return false; } }

let saveT = null;
const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(flushLocal, 250); };
export function flushLocal() { clearTimeout(saveT); return L.uid ? idbSet('state:' + L.uid, { s: L.s, dirty: L.dirty, m: L.m }) : Promise.resolve(); }

// ------------------------------------------------------------------ status + change events
const subs = new Set();
export const onChange = fn => { subs.add(fn); return () => subs.delete(fn); };
const emit = k => subs.forEach(f => { try { f(k); } catch (e) { console.error(e); } });
const anyDirty = () => Object.keys(L.dirty).length > 0;
let syncing = false, lastErr = null, offlineFlag = false;
export function status() {
  if (!L.uid) return 'idle';
  if (syncing) return 'syncing';
  if (!navigator.onLine || offlineFlag) return 'offline';
  if (lastErr) return 'error';
  return anyDirty() ? 'pending' : 'synced';
}
export const lastError = () => lastErr;

// ------------------------------------------------------------------ syncing with Firestore
const rev = {};
let timer = null, timerDue = 0, again = false, lastPull = 0;
function schedule(ms) {
  const due = Date.now() + ms;
  if (timer && timerDue <= due) return;
  clearTimeout(timer); timerDue = due;
  timer = setTimeout(() => { timer = null; timerDue = 0; syncNow(false); }, ms);
}
function touch(n) {
  rev[n] = (rev[n] || 0) + 1; L.dirty[n] = true;
  saveSoon(); schedule(n === 'sessions' ? 20000 : 4000); emit('status');
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'app/timeout' })), ms))]);

async function syncDoc(n) {
  const ref = doc(db, 'users', L.uid, 'sync', n), r0 = rev[n] || 0;
  const merged = await withTimeout(runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const remote = snap.exists() ? parse(snap.data().d, n) : emptyDoc(n);
    const m = mergeDoc(n, L.s[n], remote);
    if (!eq(m, remote)) tx.set(ref, { d: JSON.stringify(m), v: 1, updatedAt: Date.now() });
    return m;
  }), 25000);
  const cur = mergeDoc(n, L.s[n], merged);        // also keeps anything changed while we were waiting
  const changed = !eq(cur, L.s[n]);
  L.s[n] = cur;
  if ((rev[n] || 0) === r0) delete L.dirty[n];
  return changed;
}

// pull=true: read all six documents (6 reads) and merge. pull=false: only the changed ones.
export async function syncNow(pull = true) {
  if (!L.uid) return false;
  if (syncing) { again = again || pull; return false; }
  if (!navigator.onLine) { emit('status'); return false; }
  syncing = true; offlineFlag = false; emit('status');
  let ok = true, changed = false;
  try {
    for (const n of NAMES) if (pull || L.dirty[n]) changed = (await syncDoc(n)) || changed;
    if (pull) lastPull = Date.now();
    L.m.lastSync = Date.now(); lastErr = null;
  } catch (e) {
    ok = false; lastErr = e;
    const c = (e && e.code) || '';
    offlineFlag = ['unavailable', 'app/timeout', 'deadline-exceeded', 'failed-precondition'].includes(c) || !navigator.onLine;
    if (offlineFlag) lastErr = null;
    console.warn('sync problem:', e);
  }
  syncing = false; saveSoon(); emit('status');
  if (changed) emit('data');
  if (again) { const p = again; again = false; schedule(p ? 500 : 3000); }
  return ok;
}
export const flushNow = () => { flushLocal(); return anyDirty() ? syncNow(false) : Promise.resolve(); };

let hooked = false;
function hook() {
  if (hooked) return; hooked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
    else if (L.uid && Date.now() - lastPull > 60000) syncNow(true);
  });
  window.addEventListener('pagehide', () => { flushLocal(); });
  window.addEventListener('online', () => { if (L.uid) syncNow(true); });
  window.addEventListener('offline', () => emit('status'));
}

// ------------------------------------------------------------------ start / stop
export async function start(uid) {
  L.uid = uid; lastErr = null; offlineFlag = false;
  const v = await idbGet('state:' + uid);
  L.s = emptyState();
  if (v && v.s) NAMES.forEach(n => { if (v.s[n] != null) L.s[n] = v.s[n]; });
  L.dirty = (v && v.dirty) || {}; L.m = (v && v.m) || {};
  hook();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* ignore */ }
  let moved = null;
  if (!L.m.migrated) moved = await migrateFromOldApp(false);
  const first = syncNow(true);
  await Promise.race([first, new Promise(r => setTimeout(r, 3500))]);   // don't make the first screen wait long
  return moved;
}
export async function stop() {
  try { await withTimeout(flushNow(), 5000); } catch (e) { /* ignore */ }
  await flushLocal();
  clearTimeout(timer); timer = null;
  L.uid = null; L.s = emptyState(); L.dirty = {}; L.m = {};
  emit('status');
}

// ------------------------------------------------------------------ old app (single-file version) -> this account
function readOldProgress() {
  return new Promise(res => {
    let r; try { r = indexedDB.open('encor-bank'); } catch (e) { return res(null); }
    r.onupgradeneeded = () => { try { r.transaction.abort(); } catch (e) { /* did not exist */ } };
    r.onerror = () => res(null);
    r.onsuccess = () => {
      const d = r.result;
      try {
        if (!d.objectStoreNames.contains('kv')) { d.close(); return res(null); }
        const q = d.transaction('kv').objectStore('kv').get('progress');
        q.onsuccess = () => { d.close(); res(q.result || null); };
        q.onerror = () => { d.close(); res(null); };
      } catch (e) { d.close(); res(null); }
    };
  });
}
// Moves progress the old app saved in THIS browser (IndexedDB "encor-bank") into the account.
// Automatic only once (first account that signs in here); the Progress tab has a button to repeat it.
export async function migrateFromOldApp(force) {
  const key = 'migratedFor';
  const claimed = await idbGet(key);
  if (!force && claimed && claimed !== L.uid) { L.m.migrated = true; saveSoon(); return null; }
  const p = await readOldProgress();
  L.m.migrated = true;
  if (!(p && p.q && Object.keys(p.q).length + Object.keys(p.fc || {}).length + (p.hist || []).length)) { saveSoon(); return null; }
  const r = absorb(p);
  await idbSet(key, L.uid);
  await flushLocal();
  return r;
}

// ------------------------------------------------------------------ mutations (the app calls these)
export const getStat = id => L.s.stats.q[id];
export function rec(id, m, ok, prev) {
  const e = L.s.stats.q[id] = L.s.stats.q[id] || { s: [0, 0], p: [0, 0], e: [0, 0] };
  if (prev != null && prev !== '') { const k = prev === true || prev === 'c' ? 0 : 1; if (e[m][k] > 0) e[m][k]--; }
  e[m][ok ? 0 : 1]++; e.last = ok ? 'c' : 'w'; e.ts = Date.now();
  touch('stats');
}
export const isFlag = id => !!(L.s.flags[id] && L.s.flags[id].f);
export const flagCount = () => Object.values(L.s.flags).filter(x => x && x.f).length;
export function setFlag(id, f) { L.s.flags[id] = { f: f ? 1 : 0, ts: Date.now() }; touch('flags'); }
export const cardState = id => (L.s.cards[id] || {}).s || '';
export function setCard(id, s) { L.s.cards[id] = { s, ts: Date.now() }; touch('cards'); }
export function clearCards(ids) { const ts = Date.now(); ids.forEach(id => { if (L.s.cards[id]) L.s.cards[id] = { s: '', ts }; }); touch('cards'); }
export function addHist(h) { L.s.history = mergeHist(L.s.history, [h], L.s.stats.resetAt || 0); touch('history'); }
export function updateHist(h) { touch('history'); }
export const history = () => L.s.history;
export const setting = (k, def) => (L.s.settings[k] === undefined ? def : L.s.settings[k]);
export function setSetting(k, v) { L.s.settings[k] = v; L.s.settings.ts = Date.now(); touch('settings'); }
export const getSession = n => { const x = L.s.sessions[n]; return (x && x.s) || null; };
export function setSession(n, obj, now) { L.s.sessions[n] = { ts: Date.now(), s: obj }; touch('sessions'); if (now) syncNow(false); }
export function resetStats() { L.s.stats = { resetAt: Date.now(), q: {} }; L.s.history = []; touch('stats'); touch('history'); }
export const answeredToday = () => { const d = dayStart(); return Object.values(L.s.stats.q).filter(e => tsOf(e) >= d).length; };
export const lastSync = () => L.m.lastSync || 0;

// ------------------------------------------------------------------ backup: export / import (import MERGES, never replaces)
export function exportProgress() {
  return JSON.stringify({ format: 'encor-progress', version: 2, exportedAt: Date.now(), stats: L.s.stats, cards: L.s.cards, flags: L.s.flags, history: L.s.history, settings: L.s.settings, sessions: {} });
}
// Accepts the new export and the old single-file app's export ({q, hist, fc}).
export function absorb(p) {
  if (!p || typeof p !== 'object') throw new Error('not a progress file');
  let inc;
  if (p.format === 'encor-progress') inc = { stats: p.stats || emptyDoc('stats'), cards: p.cards || {}, flags: p.flags || {}, history: p.history || [], settings: p.settings || { ts: 0 } };
  else if (p.q && typeof p.q === 'object') inc = { stats: { resetAt: 0, q: p.q }, cards: p.fc || {}, flags: {}, history: p.hist || [], settings: { ts: 0 } };
  else throw new Error('not a progress file');
  const fix = o => { for (const k in o) if (o[k] && typeof o[k] === 'object' && !o[k].ts) o[k].ts = 1; return o; };
  inc.stats.q = fix(inc.stats.q || {}); inc.cards = fix(inc.cards); inc.flags = fix(inc.flags);
  const before = Object.keys(L.s.stats.q).length;
  NAMES.forEach(n => { if (n === 'sessions') return; L.s[n] = mergeDoc(n, L.s[n], inc[n]); touch(n); });
  const after = Object.keys(L.s.stats.q).length;
  emit('data');
  return { questions: Object.keys(inc.stats.q).length, added: after - before, cards: Object.keys(inc.cards).length, tests: inc.history.length };
}
