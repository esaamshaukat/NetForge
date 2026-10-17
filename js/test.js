// Practice test and Exam share this engine (mode = 'practice' | 'exam').
import { esc, same, shuf, fmt } from './util.js';
import { D, ensureForIds, getQ } from './data.js';
import * as P from './sync.js';
import { App, icon, actionBar, qBody, opts, explHtml, result, topicPicker, topicAction } from './ui.js';

const REAL_MIN = 120, REAL_LO = 85, REAL_HI = 110, REAL_AVG = (REAL_LO + REAL_HI) / 2;
const calcMins = n => Math.max(1, Math.ceil(n * REAL_MIN / REAL_AVG));
const mk = m => ({ mode: m, phase: 'setup', n: 20, tp: [], tpOpen: false, labs: false, timed: true, mins: 0, edited: false, focus: 'mix', qs: [], ans: {}, flag: {}, chk: {}, self: {}, show: {}, i: 0, warn: false, quit: false, paused: false, used: 0, left: 0, limit: 0, last: 0, onlyWrong: false, onlyFlag: false, hist: null, timeUp: false, pal: false });
export const T = { practice: mk('practice'), exam: mk('exam') };
export const running = () => ['practice', 'exam'].find(m => T[m].phase === 'run');

// ---- pool (ids only; questions are loaded when a test starts) ----
function poolIds(t, topics = true) {
  let ids = [];
  D.topics.forEach(tp => {
    if (topics && t.tp.length && !t.tp.includes(tp.name)) return;
    const skip = new Set(tp.noKey), labs = new Set(tp.labs);
    tp.ids.forEach(id => { if (skip.has(id)) return; if (labs.has(id) && !t.labs) return; ids.push(id); });
  });
  if (t.focus === 'flag') ids = ids.filter(id => P.isFlag(id));
  return ids;
}
const countFor = t => poolIds({ tp: [], labs: true, focus: 'mix' }, false).filter(id => D.topicOf.get(id) === t).length;
const prio = id => { const s = P.getStat(id); return !s ? 1 : s.last === 'w' ? 0 : 2; };
function draw(ids, n, focus) {
  const by = {};
  ids.forEach(id => (by[D.topicOf.get(id)] = by[D.topicOf.get(id)] || []).push(id));
  const ts = Object.keys(by), take = {};
  ts.forEach(t => { take[t] = 0; by[t] = shuf(by[t]); if (focus === 'weak') by[t].sort((a, b) => prio(a) - prio(b)); });
  let left = n;
  while (left > 0) { const open = shuf(ts.filter(t => take[t] < by[t].length)); if (!open.length) break; for (const t of open) { if (left <= 0) break; take[t]++; left--; } }
  return shuf(ts.flatMap(t => by[t].slice(0, take[t])));
}
const okOf = (t, q) => { if (q.type === 'mcq') return same(t.ans[q.id] || [], q.correctAnswer); const s = t.self[q.id]; return s === 'c' ? true : s === 'w' ? false : null; };
function scoreT(t) {
  let c = 0, tot = 0, pend = 0; const tp = {};
  t.qs.forEach(q => { const ok = okOf(t, q); if (ok === null) { pend++; return; } tot++; if (ok) c++; const x = tp[q.topic] = tp[q.topic] || [0, 0]; x[1]++; if (ok) x[0]++; });
  return { c, tot, pend, tp };
}

// ---- saved (paused) sessions ----
function saveSession(t) {
  if (t.phase !== 'run') return;
  P.setSession(t.mode, { qs: t.qs.map(q => q.id), ans: t.ans, flag: t.flag, chk: t.chk, self: t.self, show: t.show, i: t.i, used: t.used, left: t.left, limit: t.limit, timed: t.timed, n: t.n });
}
export const savedSession = m => T[m].phase === 'setup' ? P.getSession(m) : null;
export async function resume(m) {
  const t = T[m], s = P.getSession(m); if (!s) return;
  await ensureForIds(s.qs);
  const qs = s.qs.map(getQ).filter(Boolean);
  if (!qs.length) { P.setSession(m, null); return; }
  Object.assign(t, { phase: 'run', qs, ans: s.ans || {}, flag: s.flag || {}, chk: s.chk || {}, self: s.self || {}, show: s.show || {}, i: Math.min(s.i || 0, qs.length - 1), used: s.used || 0, left: s.left || 0, limit: s.limit || 0, timed: !!s.timed, n: s.n || qs.length, warn: false, quit: false, paused: true, last: Date.now(), timeUp: false, onlyWrong: false, onlyFlag: false, hist: null, pal: false });
}

// ---- rendering ----
function renderSetup(t) {
  const ex = t.mode === 'exam', pool = poolIds(t), all = D.topics.length;
  const noKeyN = D.noKey.size, labN = D.labs.size, n = Math.max(1, Math.min(pool.length || 1, t.n));
  if (!t.edited) t.mins = calcMins(n);
  const sv = savedSession(t.mode);
  let h = '';
  if (sv) h += `<div class="card resume"><b>You have a paused ${ex ? 'exam' : 'practice test'}</b><div class="mu">Question ${Math.min((sv.i || 0) + 1, sv.qs.length)} of ${sv.qs.length}. It was saved on your account, so you can carry on from any device.</div><div class="btns"><button class="btn pri" data-act="resume">Resume</button><button class="btn" data-act="discard">Discard it</button></div></div>`;
  h += topicPicker(t, name => poolIds({ tp: [], labs: t.labs, focus: 'mix' }, false).filter(id => D.topicOf.get(id) === name).length);
  h += `<div class="card"><h2>${ex ? 'Exam' : 'Practice test'}</h2>
<p class="mu" style="margin-top:0">${ex ? 'Answers and explanations appear only after you submit.' : 'Like the exam, but you can <b>check each answer</b> and read the explanation straight away.'}</p>
<div class="row"><label class="fld">How many questions <input type="number" id="n" min="1" max="${Math.max(1, pool.length)}" value="${n}" inputmode="numeric"></label></div>
<div class="row"><label class="chk"><input type="checkbox" id="labs" ${t.labs ? 'checked' : ''}> Include lab questions (you mark them yourself)</label></div>
<div class="row"><label class="chk"><input type="checkbox" id="timed" ${t.timed ? 'checked' : ''}> Timed</label>${t.timed ? `<label class="fld">Minutes <input type="number" id="mins" min="1" max="600" value="${t.mins}" inputmode="numeric"></label>` : '<span class="mu">Untimed: a stopwatch still shows how long you took.</span>'}</div>
${t.timed ? `<div class="note">The real exam gives ${REAL_MIN} minutes for ${REAL_LO} to ${REAL_HI} questions (about ${Math.round(REAL_MIN * 60 / REAL_AVG)} seconds each). The time is worked out from that, and you can change it.</div>` : ''}
<div class="row"><label class="fld">Which questions <select id="focus"><option value="mix" ${t.focus === 'mix' ? 'selected' : ''}>Random mix</option><option value="weak" ${t.focus === 'weak' ? 'selected' : ''}>Weak spots first</option><option value="flag" ${t.focus === 'flag' ? 'selected' : ''}>My flagged questions only</option></select></label></div>
<div class="note"><b>${pool.length}</b> question${pool.length === 1 ? '' : 's'} available. Tests leave out ${noKeyN} question${noKeyN === 1 ? '' : 's'} with no answer key${t.labs ? '' : ` and the ${labN} lab questions`}. Questions are drawn evenly across the topics you picked.</div>
<div class="btns"><button class="btn pri big" data-act="start" ${pool.length ? '' : 'disabled'}>Start ${ex ? 'exam' : 'practice test'}</button></div></div>`;
  return h;
}
function palette(t) {
  const prac = t.mode === 'practice';
  return `<div class="pal">${t.qs.map((x, j) => { let c = ''; if (j === t.i) c += ' cur'; const a = t.ans[x.id] || [];
    if (x.type === 'mcq') { if (prac && t.chk[x.id]) c += same(a, x.correctAnswer) ? ' ok' : ' no'; else if (a.length) c += ' done'; }
    else if (t.self[x.id]) c += t.self[x.id] === 'c' ? ' ok' : ' no'; else if (t.show[x.id]) c += ' done';
    if (t.flag[x.id]) c += ' fl'; return `<button data-act="go" data-j="${j}" class="${c.trim()}" aria-label="Question ${j + 1}">${j + 1}</button>`; }).join('')}</div><div class="legend">Blue = answered${prac ? ', green/red = checked' : ''}, corner mark = flagged</div>`;
}
function renderRun(t) {
  const q = t.qs[t.i], prac = t.mode === 'practice', mcqs = t.qs.filter(x => x.type === 'mcq');
  const done = mcqs.filter(x => (t.ans[x.id] || []).length).length, un = mcqs.length - done, fl = t.qs.filter(x => t.flag[x.id]).length;
  const rem = t.timed ? t.left : t.used;
  let h = `<div class="tbar"><div class="l"><b>${t.i + 1}<span class="mu"> / ${t.qs.length}</span></b><span class="mu sm">${done}/${mcqs.length} answered${fl ? ' · ' + fl + ' flagged' : ''}</span></div>
<div class="r"><span class="timer ${t.timed && t.left < 300 ? 'low' : ''}" id="tm" title="${t.timed ? 'Time left' : 'Time elapsed'}">${fmt(rem)}</span>
<button class="iconbtn ${t.pal ? 'on' : ''}" data-act="pal" aria-label="Question list">${icon('grid')}</button><button class="iconbtn" data-act="pause" aria-label="Pause">${icon('pause')}</button><button class="iconbtn" data-act="quit" aria-label="Quit">${icon('x')}</button></div></div>`;
  if (t.pal) h += palette(t);
  h += `<div class="card">${qBody(q, t.flag[q.id])}`;
  if (q.type === 'mcq') {
    const chk = prac && t.chk[q.id];
    h += opts(q, t.ans[q.id] || [], !!chk);
    if (chk) h += result(same(t.ans[q.id] || [], q.correctAnswer), q) + explHtml(q);
  } else if (prac) {
    if (t.show[q.id]) { h += explHtml(q); h += t.self[q.id] ? `<div class="res ${t.self[q.id] === 'c' ? 'ok' : 'no'}">Recorded: ${t.self[q.id] === 'c' ? 'you got it right' : 'you got it wrong'}. <button class="btn sm" data-act="self" data-id="${esc(q.id)}" data-v="${t.self[q.id] === 'c' ? 'w' : 'c'}">Change</button></div>` : `<div class="note">Compare with the solution, then record how you did:<div class="btns"><button class="btn" data-act="self" data-id="${esc(q.id)}" data-v="c">I got it right</button><button class="btn" data-act="self" data-id="${esc(q.id)}" data-v="w">I got it wrong</button></div></div>`; }
  } else h += '<div class="note">Lab question: work it out, then move on. You will see the solution and mark yourself after you submit.</div>';
  h += '</div>';
  if (t.warn) h += `<div class="card confirm"><b>Submit now?</b><div class="mu">${un ? `${un} unanswered question${un > 1 ? 's' : ''}. ` : ''}${fl ? `${fl} flagged question${fl > 1 ? 's' : ''} still to review. ` : ''}${t.timed ? `Time left: ${fmt(t.left)}.` : ''}</div><div class="btns"><button class="btn pri" data-act="submit">Submit</button><button class="btn" data-act="cancel">Keep going</button>${fl ? '<button class="btn" data-act="nextflag">Go to next flagged</button>' : ''}</div></div>`;
  if (t.quit) h += `<div class="card confirm bad"><b>Quit this ${prac ? 'practice test' : 'exam'}?</b><div class="mu">Your answers for this test will be discarded.${prac ? ' Answers you already checked stay on your progress.' : ''}</div><div class="btns"><button class="btn danger" data-act="quitok">Yes, quit</button><button class="btn" data-act="cancel">Keep going</button></div></div>`;
  const items = [{ act: 'tprev', icon: 'left', label: 'Previous', disabled: !t.i }];
  if (prac) items.push(q.type === 'mcq' ? { act: 'tcheck', icon: 'check', label: 'Check', cls: 'pri', disabled: !(t.ans[q.id] || []).length || t.chk[q.id] } : { act: 'tshow', icon: 'bulb', label: t.show[q.id] ? 'Hide' : 'Solution', cls: 'pri' });
  items.push({ act: 'flag', icon: 'flag', label: t.flag[q.id] ? 'Flagged' : 'Flag', cls: t.flag[q.id] ? 'on warn' : '' }, { act: 'tnext', icon: 'right', label: 'Next', cls: prac ? '' : 'pri', disabled: t.i >= t.qs.length - 1 }, '|', { act: 'finish', icon: 'stop', label: 'Finish', cls: 'finish' });
  return h + actionBar(items);
}
function renderResult(t) {
  const prac = t.mode === 'practice', sc = scoreT(t), pc = sc.tot ? (sc.c / sc.tot * 100).toFixed(1) : '0.0';
  let h = `<div class="card"><div class="mu">${t.timeUp ? "Time's up! " : ''}Your ${prac ? 'practice test' : 'exam'} score</div><div class="score">${sc.c} / ${sc.tot}</div><div class="scpct">${pc}%</div>
<div class="mu">Time used: ${fmt(t.used)}${t.limit ? ' of ' + fmt(t.limit) : ''}${sc.pend ? ` · ${sc.pend} lab question${sc.pend > 1 ? 's' : ''} not marked yet (mark them below and the score updates)` : ''}</div>
<table><tr><th>Topic</th><th>Correct</th><th>%</th></tr>${Object.entries(sc.tp).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v[0]} / ${v[1]}</td><td>${Math.round(v[0] / v[1] * 100)}%</td></tr>`).join('')}</table>
<div class="btns"><button class="btn pri" data-act="again">New ${prac ? 'practice test' : 'exam'}</button><button class="btn" data-act="gohome">Back to home</button></div>
<div class="row"><label class="chk"><input type="checkbox" id="wrong" ${t.onlyWrong ? 'checked' : ''}> Only questions I got wrong</label><label class="chk"><input type="checkbox" id="onlyflag" ${t.onlyFlag ? 'checked' : ''}> Only flagged</label></div></div>`;
  t.qs.forEach((q, j) => {
    const ok = okOf(t, q); if (t.onlyWrong && ok !== false) return; if (t.onlyFlag && !t.flag[q.id]) return; const a = t.ans[q.id] || [];
    h += `<div class="card rv ${ok === true ? 'good' : ok === null ? 'pend' : ''}"><div class="status ${ok === true ? 'ok' : ok === false ? 'no' : ''}">Question ${j + 1}: ${ok === true ? 'Correct' : ok === false ? 'Incorrect' : 'Not marked yet'}</div>${qBody(q, t.flag[q.id])}`;
    if (q.type === 'mcq') h += opts(q, a, true) + `<div class="small">Your answer: ${a.length ? a.join(', ') : 'none'}. Correct answer: ${q.correctAnswer.join(', ') || 'not given'}.</div>`;
    else h += ok === null ? `<div class="note">Compare with the solution below, then mark yourself:<div class="btns"><button class="btn" data-act="self" data-id="${esc(q.id)}" data-v="c">I got it right</button><button class="btn" data-act="self" data-id="${esc(q.id)}" data-v="w">I got it wrong</button></div></div>` : `<div class="small">You marked this lab as ${ok ? 'right' : 'wrong'}. <button class="btn sm" data-act="self" data-id="${esc(q.id)}" data-v="${ok ? 'w' : 'c'}">Change</button></div>`;
    h += explHtml(q) + '</div>';
  });
  return h;
}
export const render = m => { const t = T[m]; return t.phase === 'setup' ? renderSetup(t) : t.phase === 'run' ? renderRun(t) : renderResult(t); };

// ---- logic ----
async function start(t) {
  const pool = poolIds(t), n = Math.max(1, Math.min(pool.length, parseInt(document.querySelector('#n') && document.querySelector('#n').value) || t.n || 1)); t.n = n;
  const ids = draw(pool, n, t.focus);
  await ensureForIds(ids);
  Object.assign(t, { qs: ids.map(getQ).filter(Boolean), ans: {}, flag: {}, chk: {}, self: {}, show: {}, i: 0, warn: false, quit: false, paused: false, used: 0, timeUp: false, onlyWrong: false, onlyFlag: false, hist: null, pal: false });
  t.limit = t.timed ? (parseInt(t.mins) || calcMins(n)) * 60 : 0; t.left = t.limit; t.last = Date.now(); t.phase = 'run';
  saveSession(t);
}
export function finish(t, timeUp) {
  if (t.phase !== 'run') return;
  t.phase = 'result'; t.warn = false; t.quit = false; t.paused = false; t.timeUp = !!timeUp;
  t.qs.forEach(q => { if (q.type !== 'mcq') return; const a = t.ans[q.id] || []; if (!a.length) return; if (t.mode === 'exam' || !t.chk[q.id]) P.rec(q.id, t.mode === 'exam' ? 'e' : 'p', same(a, q.correctAnswer)); });
  const sc = scoreT(t); t.hist = { t: Date.now(), mode: t.mode, c: sc.c, tot: sc.tot, secs: t.used, limit: t.limit, n: t.qs.length }; P.addHist(t.hist);
  P.setSession(t.mode, null, true);
}
// called every 250 ms by the shell
export function tick() {
  const m = running(); if (!m) return false;
  const t = T[m], now = Date.now();
  if (t.paused) { t.last = now; return false; }
  const d = Math.floor((now - t.last) / 1000); if (d < 1) return false;
  t.last += d * 1000; t.used += d;
  if (t.timed) { t.left -= d; if (t.left <= 0) { t.left = 0; finish(t, true); return true; } }
  const el = document.querySelector('#tm'); if (el) { el.textContent = fmt(t.timed ? t.left : t.used); el.classList.toggle('low', t.timed && t.left < 300); }
  if (t.used % 20 === 0) saveSession(t);
  return false;
}
export function pauseNow() { const m = running(); if (m && !T[m].paused) { T[m].paused = true; saveSession(T[m]); P.setSession(m, P.getSession(m), true); } }

export async function handle(m, a, b) {
  const t = T[m];
  if (topicAction(a, b, t, D.topics.map(x => x.name))) return true;
  if (a === 'start') { await start(t); scrollTo(0, 0); return true; }
  if (a === 'resume') { await resume(m); scrollTo(0, 0); return true; }
  if (a === 'discard') { P.setSession(m, null, true); return true; }
  if (t.phase === 'run') {
    const q = t.qs[t.i];
    if (a === 'pick') { if (t.paused || (m === 'practice' && t.chk[q.id])) return true; const k = b.dataset.k, c = t.ans[q.id] || []; t.ans[q.id] = q.correctAnswer.length > 1 ? (c.includes(k) ? c.filter(x => x !== k) : c.concat(k)) : [k]; t.warn = false; saveSession(t); return true; }
    if (a === 'tcheck') { if (!(t.ans[q.id] || []).length || t.chk[q.id]) return true; t.chk[q.id] = true; P.rec(q.id, 'p', same(t.ans[q.id], q.correctAnswer)); saveSession(t); return true; }
    if (a === 'tshow') { t.show[q.id] = !t.show[q.id]; return true; }
    if (a === 'go') { t.i = +b.dataset.j; t.warn = false; saveSession(t); scrollTo(0, 0); return true; }
    if (a === 'tprev' || a === 'tnext') { const n = t.i + (a === 'tnext' ? 1 : -1); if (n < 0 || n >= t.qs.length) return true; t.i = n; t.warn = false; saveSession(t); scrollTo(0, 0); return true; }
    if (a === 'flag') { t.flag[q.id] = !t.flag[q.id]; P.setFlag(q.id, !!t.flag[q.id]); saveSession(t); return true; }
    if (a === 'pal') { t.pal = !t.pal; return true; }
    if (a === 'nextflag') { const n = t.qs.length; for (let d = 1; d <= n; d++) { const j = (t.i + d) % n; if (t.flag[t.qs[j].id]) { t.i = j; break; } } t.warn = false; return true; }
    if (a === 'pause') { pauseNow(); return true; }
    if (a === 'resumeRun') { t.paused = false; t.last = Date.now(); return true; }
    if (a === 'finish') { t.warn = true; t.quit = false; return true; }
    if (a === 'cancel') { t.warn = false; t.quit = false; return true; }
    if (a === 'quit') { t.quit = true; t.warn = false; return true; }
    if (a === 'quitok') { t.phase = 'setup'; t.quit = false; t.warn = false; P.setSession(m, null, true); return true; }
    if (a === 'submit') { finish(t, false); scrollTo(0, 0); return true; }
  }
  if (a === 'self') { const id = b.dataset.id, v = b.dataset.v, prev = t.self[id]; if (prev === v) return true; t.self[id] = v; P.rec(id, m === 'exam' ? 'e' : 'p', v === 'c', prev || null); if (t.hist) { const sc = scoreT(t); t.hist.c = sc.c; t.hist.tot = sc.tot; P.updateHist(t.hist); } if (t.phase === 'run') saveSession(t); return true; }
  if (a === 'again') { t.phase = 'setup'; scrollTo(0, 0); return true; }
  return false;
}
export function input(m, id, el) {
  const t = T[m];
  if (id === 'n') { t.n = parseInt(el.value) || 1; if (!t.edited && t.timed) { t.mins = calcMins(Math.min(t.n, poolIds(t).length || t.n)); const x = document.querySelector('#mins'); if (x) x.value = t.mins; } return true; }
  if (id === 'mins') { t.mins = parseInt(el.value) || 0; t.edited = true; return true; }
  return false;
}
export function change(m, id, el) {
  const t = T[m];
  if (id === 'timed') { t.timed = el.checked; t.edited = false; return 'render'; }
  if (id === 'labs') { t.labs = el.checked; return 'render'; }
  if (id === 'focus') { t.focus = el.value; return 'render'; }
  if (id === 'wrong') { t.onlyWrong = el.checked; return 'render'; }
  if (id === 'onlyflag') { t.onlyFlag = el.checked; return 'render'; }
  return false;
}
export function key(m, e) {
  const t = T[m]; if (t.phase !== 'run' || t.paused) return false;
  const k = e.key.toLowerCase(), q = t.qs[t.i];
  if (k === 'arrowright') return handle(m, 'tnext', {});
  if (k === 'arrowleft') return handle(m, 'tprev', {});
  if (k === 'f') return handle(m, 'flag', {});
  if (k === 'enter' && m === 'practice' && q.type === 'mcq' && !t.chk[q.id] && (t.ans[q.id] || []).length) return handle(m, 'tcheck', {});
  if (q.type === 'mcq' && /^[a-h]$/.test(k) && q.options[k.toUpperCase()] !== undefined) return handle(m, 'pick', { dataset: { k: k.toUpperCase() } });
  return false;
}
export function startWeak(topics) { const t = T.practice; t.tp = topics; t.focus = 'weak'; t.phase = 'setup'; }
