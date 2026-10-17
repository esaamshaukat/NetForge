// App shell: sign-in screen, unlocking the data, navigation, events, updates.
import { $, esc } from './util.js';
import * as A from './auth.js';
import * as C from './crypto.js';
import * as Dt from './data.js';
import * as P from './sync.js';
import { App, icon } from './ui.js';
import * as dash from './dashboard.js';
import * as study from './study.js';
import * as practice from './practice.js';
import * as exam from './exam.js';
import * as fc from './flashcards.js';
import { T, tick, running, pauseNow } from './test.js';
import { BUILD } from './version.js';

App.build = BUILD;
window.__encorBooted = true;

const NAV = [['home', 'Home', 'home'], ['study', 'Study', 'study'], ['practice', 'Practice', 'practice'], ['exam', 'Exam', 'exam'], ['cards', 'Cards', 'cards'], ['progress', 'Progress', 'chart']];
const TESTS = { practice, exam };
let unlocking = null, current = null;

// ------------------------------------------------------------ screens
function show(which) {
  ['splash', 'login', 'shell'].forEach(id => { $('#' + id).hidden = id !== which; });
  document.body.dataset.screen = which;
}
function splash(msg, extra = '') { $('#splashmsg').innerHTML = esc(msg) + extra; show('splash'); }
function loginError(msg) { $('#lerr').textContent = msg || ''; }

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); loginError('');
  const em = $('#lemail').value, pw = $('#lpass').value, b = $('#lbtn');
  if (!em.trim()) return loginError('Please type your email.');
  b.disabled = true; b.textContent = 'Signing in...';
  try { await A.login(em, pw); } catch (err) { loginError(A.friendly(err)); }
  b.disabled = false; b.textContent = 'Sign in';
});
$('#lforgot').addEventListener('click', async () => {
  const em = $('#lemail').value.trim();
  if (!em) return loginError('Type your email above first, then tap "Forgot password".');
  try { await A.resetPassword(em); loginError(''); $('#lok').textContent = 'If that email has an account, a reset link is on its way. Check your spam folder too.'; }
  catch (err) { $('#lok').textContent = ''; loginError(A.friendly(err)); }
});
$('#lshow').addEventListener('change', e => { $('#lpass').type = e.target.checked ? 'text' : 'password'; });

A.onUser(async user => {
  if (!user) { current = null; App.view = 'home'; $('#lpass').value = ''; show('login'); return; }
  if (unlocking && current === user.uid) return;
  current = user.uid; unlocking = unlock(user); await unlocking; unlocking = null;
});

async function unlock(user) {
  splash('Unlocking your question bank...');
  let key = null, offline = false;
  const cached = await C.loadKey(user.uid);
  try {
    key = await C.importKey(await A.fetchKey());     // fresh key from Firestore (also checks you are still allowed)
    await C.saveKey(user.uid, key);
  } catch (e) {
    const c = e && e.code;
    if (c === 'permission-denied') { await C.clearKeys(); await A.logout(); show('login'); loginError('This account is not on the allowed list. Ask the owner to add it.'); return; }
    if (cached) { key = cached; offline = true; }
    else { return fail(A.friendly(e) + (navigator.onLine ? '' : ' You need to be online the first time you sign in on a device.')); }
  }
  try { await Dt.init(key); }
  catch (e) {
    if (e && e.name === 'OperationError' || /decrypt/i.test(String(e))) {
      if (offline) { await C.clearKeys(); return fail('The saved key no longer matches the data. Connect to the internet and sign in again.'); }
      return fail('The key in Firestore (config/bank) does not match the data files. Re-run build.py with the same secret.key, or update the Firestore key.');
    }
    return fail('Could not load the data: ' + (e && e.message || e));
  }
  App.email = user.email || '';
  const moved = await P.start(user.uid);
  applyTheme();
  mountShell();
  if (moved) toast(`Moved your old progress into your account: ${moved.questions} questions, ${moved.cards} flashcards, ${moved.tests} tests.`);
  warmCaches();
}
function fail(msg) {
  splash(msg, '<div class="btns" style="justify-content:center"><button class="btn pri" id="retry">Try again</button><button class="btn" id="so">Sign out</button></div>');
  $('#retry').onclick = () => location.reload();
  $('#so').onclick = () => App.signOut();
}

// ------------------------------------------------------------ shell / rendering
function mountShell() {
  $('#nav').innerHTML = NAV.map(([v, l, i]) => `<button data-go="${v}" aria-label="${l}">${icon(i)}<span>${l}</span></button>`).join('');
  show('shell'); updateChip(); App.view = 'home'; render();
}
function applyTheme() {
  const t = P.setting('theme', 'auto');
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches) ? '#0d1317' : '#f4f1ec';
}
App.applyTheme = applyTheme;

function render() {
  if ($('#shell').hidden) return;
  const v = App.view, r = running();
  document.body.classList.toggle('running', !!r);
  document.body.dataset.view = v;
  $$nav(v, r);
  let h = '';
  try {
    h = v === 'home' ? dash.renderHome() : v === 'progress' ? dash.renderProgress() : v === 'study' ? study.render() : v === 'cards' ? fc.render() : TESTS[v].render();
  } catch (e) { console.error(e); h = `<div class="card bad">Something went wrong showing this screen: ${esc(e.message)}</div>`; }
  $('#app').innerHTML = h;
  Dt.hydrate($('#app'));
  if (v === 'cards') fc.bind($('#app'));
  renderOv(); renderBanner();
}
function $$nav(v, r) {
  document.querySelectorAll('#nav button').forEach(b => { b.classList.toggle('on', b.dataset.go === v); b.disabled = !!r && b.dataset.go !== r; });
}
App.render = render;

App.go = async (view, o = {}) => {
  const r = running(); if (r && view !== r) { toast('Finish, pause or quit your test first.'); return; }
  busy(true);
  try {
    if (view === 'study') await study.open(o.resume);
    else if (view === 'cards') await fc.open();
    else if (o.resume && TESTS[view]) await (await import('./test.js')).resume(view);
  } catch (e) { console.error(e); toast('Could not load this part: ' + (e.message || e) + (navigator.onLine ? '' : ' (you are offline and it was not opened before)')); busy(false); return; }
  busy(false); App.view = view; scrollTo(0, 0); render();
};
function busy(on) { document.body.classList.toggle('busy', !!on); }
App.busy = busy;
let toastT;
function toast(msg) { clearTimeout(toastT); $('#toast').innerHTML = msg ? `<div class="toast">${esc(msg)}</div>` : ''; if (msg) toastT = setTimeout(() => { $('#toast').innerHTML = ''; }, 7000); }
App.toast = toast;
App.dispatch = a => act(a, { dataset: {} });
App.signOut = async () => { await P.stop(); await C.clearKeys(); Dt.reset(); T.practice.phase = T.exam.phase = 'setup'; await A.logout(); };

// ------------------------------------------------------------ sync chip
function updateChip() {
  const s = P.status(), el = $('#chip'); if (!el) return;
  const txt = { synced: 'Synced', syncing: 'Syncing', offline: 'Offline', pending: 'Saved here', error: 'Sync problem', idle: '' }[s];
  el.className = 'chip-sync ' + s; el.innerHTML = `<span class="dot ${s}"></span>${txt}`;
  el.title = { synced: 'Your progress is saved to your account', syncing: 'Saving to your account...', offline: 'No connection. Progress is saved on this device and will sync later.', pending: 'Saved on this device, will sync in a moment', error: 'Could not sync. Tap to retry.' }[s] || '';
}
P.onChange(k => {
  if (k === 'status') updateChip();
  else if (k === 'data' && !running() && ['home', 'progress'].includes(App.view)) render();
});
$('#chip').addEventListener('click', () => P.syncNow(true));

// ------------------------------------------------------------ overlays: pause, picture viewer, update banner
let lbSrc = '', waiting = null;
function renderOv() {
  const m = running(), t = m && T[m]; let h = '';
  if (t && t.paused) h = `<div class="ov pause" role="dialog" aria-label="Paused"><div class="pbig">${icon('pause')}</div><h2>Paused</h2><p>The timer is stopped and the test is hidden. Your place is saved to your account, so you can also resume on another device.</p><button class="btn pri big" data-act="resumeRun">${icon('play')} Resume</button></div>`;
  else if (lbSrc) h = `<div class="ov lb" data-lb="1"><div class="lbh">Tap outside the picture, press Esc or ✕ to close</div><button class="lbx" data-act="lbclose" aria-label="Close">✕</button><div class="lbin"><img id="lbimg" src="${lbSrc}" alt=""></div></div>`;
  $('#ov').innerHTML = h; $('#shell').inert = !!(t && t.paused);
  const im = $('#lbimg'); if (im) { const fit = () => { im.style.width = Math.min(innerWidth * .96, 1300, Math.max(im.naturalWidth * 3, Math.min(im.naturalWidth, innerWidth * .96))) + 'px'; }; im.complete ? fit() : im.onload = fit; }
}
function renderBanner() {
  $('#banner').innerHTML = waiting ? `<div class="banner"><span>A new version of the app is ready.</span><button class="btn sm pri" data-act="upd">Update now</button><button class="btn sm" data-act="updlater">Later</button></div>` : '';
}

// ------------------------------------------------------------ events
async function act(a, b) {
  if (a === 'lbclose') { lbSrc = ''; renderOv(); return; }
  if (a === 'upd') { if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' }); return; }
  if (a === 'updlater') { waiting = null; renderBanner(); return; }
  if (a === 'resumeRun') { const m = running(); if (m) { T[m].paused = false; T[m].last = Date.now(); render(); } return; }
  const v = App.view; let ok = false;
  try {
    if (v === 'home' || v === 'progress') ok = await dash.handle(a, b);
    else if (v === 'study') ok = study.handle(a, b);
    else if (v === 'cards') ok = await fc.handle(a, b);
    else if (TESTS[v]) ok = await TESTS[v].handle(a, b);
  } catch (e) { console.error(e); toast('Something went wrong: ' + (e.message || e)); ok = true; }
  if (ok) render();
}
document.addEventListener('click', e => {
  if (e.target.closest('.ov.pause') && !e.target.closest('[data-act]')) return;
  const lb = e.target.closest('[data-lb]');
  if (lb && !e.target.closest('#lbimg') && !e.target.closest('[data-act]')) { lbSrc = ''; renderOv(); return; }
  const im = e.target.closest('img.pic');
  if (im && im.src && !(running() && T[running()].paused)) { e.preventDefault(); e.stopPropagation(); lbSrc = im.src; renderOv(); return; }
  const go = e.target.closest('[data-go]'); if (go) { App.go(go.dataset.go); return; }
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled && !(b.tagName === 'INPUT' && b.dataset.act === 'pick' && false)) act(b.dataset.act, b);
}, true);
document.addEventListener('input', e => {
  const m = TESTS[App.view]; if (m && m.input) m.input(e.target.id, e.target);
});
document.addEventListener('change', async e => {
  const id = e.target.id, el = e.target, v = App.view; let r = false;
  if (id === 'pfile') { const f = el.files[0]; el.value = ''; if (f) { await dash.importFile(f); render(); } return; }
  if (v === 'study') r = study.change(id, el.type === 'checkbox' ? el.checked : el.value);
  else if (v === 'cards') r = await fc.change(id, el.type === 'checkbox' ? el.checked : el.value);
  else if (v === 'home' || v === 'progress') r = dash.change(id, el);
  else if (TESTS[v]) r = TESTS[v].change(id, el);
  if (r) render();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && lbSrc) { lbSrc = ''; renderOv(); return; }
  if ($('#shell').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.matches && e.target.matches('input[type=number],input[type=text],input[type=email],input[type=password],select,textarea')) return;
  const m = running(); if (m && T[m].paused) return;
  const v = App.view; let h = false;
  if (v === 'study') h = study.key(e); else if (v === 'cards') h = fc.key(e); else if (TESTS[v]) h = TESTS[v].key(e);
  Promise.resolve(h).then(r => { if (r) { e.preventDefault(); render(); } });
});
setInterval(() => { if (tick()) { render(); scrollTo(0, 0); } }, 250);
window.addEventListener('beforeunload', e => { if (running() && !T[running()].paused) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && running()) { pauseNow(); render(); } });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); App.installEvt = e; if (App.view === 'progress') render(); });

// ------------------------------------------------------------ service worker + "update available"
function warmCaches() {   // make sure the Firebase files and the app files are in the offline cache
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    const urls = performance.getEntriesByType('resource').map(r => r.name).filter(u => u.startsWith('https://www.gstatic.com/firebasejs/'));
    reg.active && reg.active.postMessage({ type: 'CACHE_URLS', urls });
  }).catch(() => {});
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').then(reg => {
    const flag = w => { if (navigator.serviceWorker.controller) { waiting = w; renderBanner(); } };
    if (reg.waiting) flag(reg.waiting);
    reg.addEventListener('updatefound', () => { const nw = reg.installing; if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed') flag(nw); }); });
    const check = () => reg.update().catch(() => {});
    setInterval(check, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch(e => console.warn('Service worker not available:', e));
  // Reload only when an UPDATE takes over (not on the very first install, which would wipe the sign-in form).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController || reloading) return; reloading = true; location.reload(); });
}
