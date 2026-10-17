// Home (today, continue, weak spots) and Progress (per-topic readiness, history, backup, settings).
import { esc, fmt, pct, download } from './util.js';
import { D } from './data.js';
import * as P from './sync.js';
import { App, icon } from './ui.js';
import { startWeak, savedSession } from './test.js';

let sort = 'weak', resetAsk = false;
const acc = a => (a[0] + a[1]) ? Math.round(a[0] / (a[0] + a[1]) * 100) + '%' : '-';
const band = r => !r.seen ? ['Not started', 'n'] : r.rd < .4 ? ['Needs work', 'r'] : r.rd < .7 ? ['Getting there', 'a'] : ['Strong', 'g'];

// Per-topic numbers, worked out from the topic list only (no question files needed).
export function topicStats() {
  return D.topics.map(t => {
    const skip = new Set(t.noKey), ids = t.ids.filter(id => !skip.has(id));
    let c = 0, w = 0; const m = { s: [0, 0], p: [0, 0], e: [0, 0] };
    ids.forEach(id => { const s = P.getStat(id); if (!s) return; if (s.last === 'c') c++; else if (s.last === 'w') w++; ['s', 'p', 'e'].forEach(k => { m[k][0] += s[k][0]; m[k][1] += s[k][1]; }); });
    return { t: t.name, n: ids.length, c, w, rd: ids.length ? c / ids.length : 0, seen: c + w, m };
  }).filter(r => r.n);
}
function totals(ts) {
  const N = ts.reduce((a, r) => a + r.n, 0), C = ts.reduce((a, r) => a + r.c, 0), W = ts.reduce((a, r) => a + r.w, 0);
  const tot = { s: [0, 0], p: [0, 0], e: [0, 0] }; ts.forEach(r => ['s', 'p', 'e'].forEach(k => { tot[k][0] += r.m[k][0]; tot[k][1] += r.m[k][1]; }));
  const all = [0, 0]; ['s', 'p', 'e'].forEach(k => { all[0] += tot[k][0]; all[1] += tot[k][1]; });
  return { N, C, W, seen: C + W, tot, all };
}
const ring = (p, label) => { const r = 54, c = 2 * Math.PI * r; return `<div class="ringw"><svg viewBox="0 0 130 130" class="ring"><circle cx="65" cy="65" r="${r}" class="rbg"/><circle cx="65" cy="65" r="${r}" class="rfg" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 65 65)"/></svg><div class="rtxt"><b>${p}%</b><span>${label}</span></div></div>`; };

export function renderHome() {
  const ts = topicStats(), T = totals(ts), goal = P.setting('goal', 20), today = P.answeredToday();
  const weak = ts.slice().sort((a, b) => (a.seen ? a.rd : -1) - (b.seen ? b.rd : -1) || a.t.localeCompare(b.t)).slice(0, 3);
  const ps = savedSession('practice'), es = savedSession('exam'), ss = P.getSession('study');
  const cont = [];
  if (es) cont.push(`<button class="contbtn" data-act="resumego" data-m="exam">${icon('exam')}<span><b>Resume exam</b><small>Question ${Math.min((es.i || 0) + 1, es.qs.length)} of ${es.qs.length}, paused</small></span>${icon('right')}</button>`);
  if (ps) cont.push(`<button class="contbtn" data-act="resumego" data-m="practice">${icon('practice')}<span><b>Resume practice test</b><small>Question ${Math.min((ps.i || 0) + 1, ps.qs.length)} of ${ps.qs.length}, paused</small></span>${icon('right')}</button>`);
  if (ss && ss.qid) cont.push(`<button class="contbtn" data-act="resumego" data-m="study">${icon('study')}<span><b>Continue studying</b><small>${esc(D.topicOf.get(ss.qid) || 'Study mode')} · question ${(ss.i || 0) + 1}</small></span>${icon('right')}</button>`);
  let h = `<div class="card hero">${ring(pct(T.C, T.N), 'ready')}<div class="kpis"><div class="kpi"><b>${T.seen}<small>/${T.N}</small></b><span>attempted</span></div><div class="kpi"><b>${acc(T.all)}</b><span>accuracy</span></div><div class="kpi today"><b>${today}<small>/${goal}</small></b><span>answered today</span><i style="width:${Math.min(100, pct(today, goal))}%"></i></div></div></div>`;
  h += `<div class="card"><h2>Continue where you left off</h2>${cont.length ? cont.join('') : '<div class="mu">Nothing paused. Pick something below to start.</div>'}</div>`;
  h += `<div class="quick"><button class="qbtn" data-act="dgo" data-m="study">${icon('study')}Study</button><button class="qbtn" data-act="dgo" data-m="practice">${icon('practice')}Practice</button><button class="qbtn" data-act="dgo" data-m="exam">${icon('exam')}Exam</button><button class="qbtn" data-act="dgo" data-m="cards">${icon('cards')}Flashcards</button></div>`;
  h += `<div class="card"><div class="thead"><h2>Weakest topics</h2><button class="link" data-act="dgo" data-m="progress">All topics</button></div>` + weak.map(r => { const b = band(r); return `<div class="trow"><div class="thead"><b>${esc(r.t)}</b><span class="chip ${b[1]}">${b[0]} · ${Math.round(r.rd * 100)}%</span></div><div class="sb"><i class="c" style="width:${pct(r.c, r.n)}%"></i><i class="w" style="width:${pct(r.w, r.n)}%"></i></div></div>`; }).join('') +
    `<div class="btns"><button class="btn pri" data-act="dweak">Practice my weakest topics</button></div></div>`;
  return h;
}

export function renderProgress() {
  const ts = topicStats(), T = totals(ts), hist = P.history();
  const lastE = [...hist].reverse().find(h => h.mode === 'exam');
  const rows = ts.slice();
  if (sort === 'weak') rows.sort((a, b) => (a.seen ? a.rd : -1) - (b.seen ? b.rd : -1) || a.t.localeCompare(b.t)); else if (sort === 'strong') rows.sort((a, b) => b.rd - a.rd); else rows.sort((a, b) => a.t.localeCompare(b.t));
  let h = `<div class="card hero">${ring(pct(T.C, T.N), 'ready')}<div class="kpis"><div class="kpi"><b>${T.C}<small>/${T.N}</small></b><span>last answered right</span></div><div class="kpi"><b>${acc(T.all)}</b><span>accuracy</span></div><div class="kpi"><b>${hist.length}</b><span>tests taken</span></div><div class="kpi"><b>${lastE ? Math.round(lastE.c / Math.max(1, lastE.tot) * 100) + '%' : '-'}</b><span>last exam</span></div></div></div>
<div class="sb big"><i class="c" style="width:${pct(T.C, T.N)}%"></i><i class="w" style="width:${pct(T.W, T.N)}%"></i></div><div class="mu sm" style="margin:6px 2px 12px">Green = last answered right, red = last answered wrong, grey = not attempted. Accuracy: Study ${acc(T.tot.s)} · Practice ${acc(T.tot.p)} · Exam ${acc(T.tot.e)}</div>`;
  h += `<div class="card"><div class="thead"><h2>Readiness by topic</h2><label class="fld">Sort <select id="dsort"><option value="weak" ${sort === 'weak' ? 'selected' : ''}>Weakest first</option><option value="strong" ${sort === 'strong' ? 'selected' : ''}>Strongest first</option><option value="name" ${sort === 'name' ? 'selected' : ''}>Topic name</option></select></label></div>
<div class="note">Readiness = share of a topic's questions you last answered correctly in Study, Practice or Exam. Untried questions count as not ready yet.</div>` +
    rows.map(r => { const b = band(r); return `<div class="trow"><div class="thead"><b>${esc(r.t)}</b><span><span class="chip ${b[1]}">${b[0]}</span> <b>${Math.round(r.rd * 100)}%</b></span></div><div class="sb"><i class="c" style="width:${pct(r.c, r.n)}%"></i><i class="w" style="width:${pct(r.w, r.n)}%"></i></div><div class="tdet">Attempted ${r.seen}/${r.n} · Study ${acc(r.m.s)} · Practice ${acc(r.m.p)} · Exam ${acc(r.m.e)}</div></div>`; }).join('') + '</div>';
  const recent = [...hist].reverse().slice(0, 8);
  h += `<div class="card"><h2>Recent tests</h2>` + (recent.length ? `<table><tr><th>Date</th><th>Mode</th><th>Score</th><th>Time</th></tr>${recent.map(x => `<tr><td>${new Date(x.t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td><td>${x.mode === 'exam' ? 'Exam' : 'Practice'}</td><td>${x.c}/${x.tot} (${Math.round(x.c / Math.max(1, x.tot) * 100)}%)</td><td>${fmt(x.secs)}</td></tr>`).join('')}</table>` : '<div class="mu">No tests yet.</div>') + '</div>';
  const st = P.status(), stTxt = { synced: 'Synced', syncing: 'Syncing...', offline: 'Offline (saved on this device)', pending: 'Saved on this device, waiting to sync', error: 'Could not sync' }[st] || '';
  h += `<div class="card"><h2>Settings and backup</h2>
<div class="row"><label class="fld">Theme <select id="theme"><option value="auto" ${P.setting('theme', 'auto') === 'auto' ? 'selected' : ''}>Follow my device</option><option value="light" ${P.setting('theme', 'auto') === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${P.setting('theme', 'auto') === 'dark' ? 'selected' : ''}>Dark</option></select></label>
<label class="fld">Daily goal <input type="number" id="goal" min="1" max="500" value="${P.setting('goal', 20)}" inputmode="numeric"> questions</label></div>
<div class="syncrow"><span class="dot ${st}"></span><span>${stTxt}${P.lastSync() ? ' · last sync ' + new Date(P.lastSync()).toLocaleTimeString([], { timeStyle: 'short' }) : ''}</span><button class="btn sm" data-act="syncnow">${icon('refresh')} Sync now</button></div>
<div class="btns"><button class="btn" data-act="pexp">Export my progress</button><button class="btn" data-act="pimp">Import progress</button><button class="btn" data-act="oldimp">Import from old app (this browser)</button></div>
<div class="mu sm">Importing adds to what you have and keeps the newest result for each question, so nothing is lost. It also reads the file exported by the old single-file app.</div>
<div class="btns"><button class="btn danger" data-act="preset">Reset my progress</button></div>
${resetAsk ? `<div class="note bad">This deletes all your saved results and test history on every device. Flashcard marks and flags are kept. <div class="btns"><button class="btn danger" data-act="presetok">Yes, reset everything</button><button class="btn" data-act="presetno">Cancel</button></div></div>` : ''}</div>
<div class="card"><h2>Account</h2><div class="mu">${esc(App.email || '')}</div><div class="btns"><button class="btn" data-act="signout">Sign out</button>${App.installEvt ? '<button class="btn pri" data-act="install">Install app on this device</button>' : ''}</div>
<div class="mu sm" style="margin-top:10px">App version ${esc(App.build || '-')} · data version ${esc(D.version || '-')} · ${D.meta ? D.meta.questionCount : 0} questions</div></div>`;
  return h;
}

export async function handle(a, b) {
  if (a === 'dgo') { await App.go(b.dataset.m); return true; }
  if (a === 'resumego') { const m = b.dataset.m; if (m === 'study') await App.go('study', { resume: true }); else await App.go(m, { resume: true }); return true; }
  if (a === 'dweak') { const rows = topicStats().sort((x, y) => (x.seen ? x.rd : -1) - (y.seen ? y.rd : -1)).slice(0, 3).map(r => r.t); startWeak(rows); await App.go('practice'); App.toast('Practice set up for your 3 weakest topics: ' + rows.join(', ') + '. Adjust anything, then press Start.'); return true; }
  if (a === 'syncnow') { App.toast('Syncing...'); const ok = await P.syncNow(true); App.toast(ok ? 'Everything is synced.' : (navigator.onLine ? 'Could not sync. Your progress is safe on this device and will retry.' : 'You are offline. Your progress is saved on this device.')); return true; }
  if (a === 'pexp') { download('encor_progress_' + new Date().toISOString().slice(0, 10) + '.json', P.exportProgress()); App.toast('Saved your progress as a JSON file.'); return true; }
  if (a === 'pimp') { document.querySelector('#pfile').click(); return false; }
  if (a === 'oldimp') { const r = await P.migrateFromOldApp(true); App.toast(r ? `Moved progress from the old app: ${r.questions} questions, ${r.cards} flashcards, ${r.tests} tests.` : 'No old-app progress was found in this browser. If the old app was on another address, use its "Export my progress" button and import that file here.'); return true; }
  if (a === 'preset') { resetAsk = true; return true; }
  if (a === 'presetno') { resetAsk = false; return true; }
  if (a === 'presetok') { P.resetStats(); resetAsk = false; App.toast('Your progress has been reset.'); return true; }
  if (a === 'signout') { await App.signOut(); return false; }
  if (a === 'install') { const e = App.installEvt; App.installEvt = null; if (e) { e.prompt(); await e.userChoice; } return true; }
  return false;
}
export function change(id, el) {
  if (id === 'dsort') { sort = el.value; return true; }
  if (id === 'theme') { P.setSetting('theme', el.value); App.applyTheme(); return true; }
  if (id === 'goal') { P.setSetting('goal', Math.max(1, parseInt(el.value) || 20)); return true; }
  return false;
}
export async function importFile(f) {
  try { const r = P.absorb(JSON.parse(await f.text())); App.toast(`Progress imported: ${r.questions} questions, ${r.cards} flashcards, ${r.tests} tests merged.`); }
  catch (e) { App.toast('That file is not a valid progress file.'); }
}
