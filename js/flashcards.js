// Flashcards: session builder (many topics, card types, size, order), quick "Today's review",
// light spaced repetition, retry-missed, daily streak. Swipe right = Got it, left = Missed it.
import { esc, shuf, dayNum } from './util.js';
import { D, loadAllCards, loadSubs, selIds, subsOf } from './data.js';
import * as P from './sync.js';
import { App, icon, topicPicker, topicAction } from './ui.js';

const TYPES = [['new', 'New'], ['missed', 'Missed'], ['seen', 'Seen'], ['due', 'Due'], ['star', 'Starred'], ['v12', 'New in v1.2'], ['all', 'All']];
const SIZES = [10, 20, 30, 50, 'all'];
const STREAK_MIN = 10;   // answering this many cards in a day (or finishing Today's review) keeps the streak

export const FC = { screen: 'build', sel: { tp: [], sub: [], q: '', exp: [], tpOpen: false, types: ['all'], count: 20, order: 'shuffle' }, stt: { tp: [], sub: [], q: '', exp: [], tpOpen: true }, editStudy: false, sess: null, show: false, anim: '', reset: false, msg: '', ready: false };
let all = [], byId = new Map();

const FC_OK = new Set(['B', 'I', 'U', 'EM', 'STRONG', 'BR', 'DIV', 'SPAN', 'P', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'CODE', 'PRE', 'SUB', 'SUP', 'H1', 'H2', 'H3', 'H4', 'IMG']);
const FC_DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'AUDIO', 'VIDEO']);

// Cleans the card HTML (keeps only simple formatting) and marks pictures to be filled in later.
function fcHtml(h) {
  const d = new DOMParser().parseFromString('<body>' + h, 'text/html').body;
  const walk = n => {
    [...n.childNodes].forEach(ch => {
      if (ch.nodeType === 3) return;
      if (ch.nodeType !== 1) { ch.remove(); return; }
      const tag = ch.tagName;
      if (FC_DROP.has(tag)) { ch.remove(); return; }
      if (!FC_OK.has(tag)) { walk(ch); ch.replaceWith(...ch.childNodes); return; }
      if (tag === 'IMG') {
        const s = ch.getAttribute('src') || '';
        [...ch.attributes].forEach(a => ch.removeAttribute(a.name));
        ch.setAttribute('data-img', s); ch.setAttribute('data-k', 'c'); ch.setAttribute('alt', ''); ch.setAttribute('title', 'Click to enlarge'); ch.className = 'pic';
        return;
      }
      [...ch.attributes].forEach(a => ch.removeAttribute(a.name)); walk(ch);
    });
  };
  walk(d); return d.innerHTML;
}

// ------------------------------------------------------------------ which cards match
const cats = c => {
  const i = P.cardInfo(c.id), today = dayNum();
  return { new: !i.seen, missed: i.last === 'm', seen: i.seen, due: i.seen && i.due <= today, star: i.star, v12: !!(c.n && c.n !== '0'), all: true };
};
const inTopics = () => { const s = selIds(FC.sel, 'c'); return s ? all.filter(c => s.has(String(c.id))) : all; };
const pickerCfg = (pk, onChange, extra) => ({ pk, kind: 'c', get topics() { return D.cardTopics.map(t => ({ name: t.t, ids: t.ids })); }, count: ids => ids.length, onChange, extraChips: extra });
const unitLabel = k => k.includes('||') ? k.split('||')[1] + ' (' + k.split('||')[0] + ')' : k;
const matches = (c, types) => { const k = cats(c); return types.includes('all') || types.some(t => k[t]); };
const byTopicOrder = ids => {
  const ix = new Map(all.map((c, j) => [String(c.id), j])), tx = new Map(D.cardTopics.map((t, j) => [t.t, j]));
  return ids.sort((a, b) => (tx.get(byId.get(a).t) - tx.get(byId.get(b).t)) || (ix.get(a) - ix.get(b)));
};
function builderIds() {
  let l = shuf(inTopics().filter(c => matches(c, FC.sel.types)).map(c => String(c.id)));
  if (FC.sel.count !== 'all') l = l.slice(0, Math.max(1, +FC.sel.count || 20));
  return FC.sel.order === 'topic' ? byTopicOrder(l) : l;
}
// Quick review: 20 cards for 1-2 study topics, 25 for 3, 30 for 4+, split evenly; fill Missed > Due > Seen > New.
// A study "topic" can be a whole topic or a single subtopic.
const quickSize = k => k <= 2 ? 20 : k === 3 ? 25 : 30;
function studyUnits() {
  const tp = P.studyTopics().filter(x => D.cardTopics.some(c => c.t === x));
  const sub = P.studySubs().filter(k => !tp.includes(k.split('||')[0]));
  return { tp, sub, k: tp.length + sub.length };
}
function unitCards(u) {
  const out = [];
  u.tp.forEach(t => out.push(all.filter(c => c.t === t)));
  u.sub.forEach(k => { const s = selIds({ tp: [], sub: [k] }, 'c'); out.push(all.filter(c => s && s.has(String(c.id)))); });
  return out;
}
function quickIds(u) {
  const today = dayNum(), n = quickSize(u.k), pools = unitCards(u);
  const rank = c => { const i = P.cardInfo(c.id); return i.last === 'm' ? 0 : (i.seen && i.due <= today) ? 1 : i.seen ? 2 : 3; };
  const sorted = arr => arr.map(c => [rank(c), Math.random(), c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
  const per = Math.floor(n / pools.length), extra = n % pools.length, chosen = [], used = new Set();
  pools.forEach((pool, ix) => sorted(pool).filter(c => !used.has(String(c.id))).slice(0, per + (ix < extra ? 1 : 0)).forEach(c => { chosen.push(String(c.id)); used.add(String(c.id)); }));
  const left = n - chosen.length;
  if (left > 0) sorted([...new Map(pools.flat().map(c => [String(c.id), c])).values()].filter(c => !used.has(String(c.id)))).slice(0, left).forEach(c => chosen.push(String(c.id)));
  return shuf(chosen);
}

// ------------------------------------------------------------------ sessions
const saveSess = () => P.setSession('cards', FC.sess && FC.screen === 'session' ? FC.sess : null);
function begin(ids, quick) {
  if (!ids.length) { FC.msg = 'No cards match those choices.'; return; }
  FC.sess = { ids, i: 0, got: [], missed: [], skipped: [], quick: !!quick }; FC.screen = 'session'; FC.show = false; FC.anim = ''; FC.msg = ''; saveSess(); scrollTo(0, 0);
}
function startQuick() {
  const t = studyUnits();
  if (!t.k) { FC.screen = 'build'; FC.editStudy = true; FC.msg = "Pick the topics you are studying now (tick them below). Then Today's review can build your daily mix."; return; }
  begin(quickIds(t), true);
}
function finish() {
  const s = FC.sess; FC.screen = 'end'; FC.show = false;
  P.setSession('cards', null);
  if (s.quick || P.cardsAnsweredToday() >= STREAK_MIN) P.bumpStreak();
}
function advance() { const s = FC.sess; s.i++; FC.show = false; FC.anim = 'next'; scrollTo(0, 0); if (s.i >= s.ids.length) finish(); else saveSess(); }
function answer(got) {
  const s = FC.sess, id = s && s.ids[s.i]; if (!id) return;
  P.answerCard(id, got); (got ? s.got : s.missed).push(id);
  if (P.cardsAnsweredToday() >= STREAK_MIN) P.bumpStreak();
  advance();
}

export async function open(o = {}) {
  if (!D.cardTopics.length) { FC.ready = true; return; }
  await loadSubs();
  FC.stt.tp = P.studyTopics().slice(); FC.stt.sub = P.studySubs().slice();
  all = await loadAllCards(); byId = new Map(all.map(c => [String(c.id), c])); FC.ready = true;
  if (o.quick) startQuick();
  else if (o.resume) {
    const s = P.getSession('cards');
    if (s && s.ids) { s.ids = s.ids.filter(id => byId.has(id)); if (s.ids.length && s.i < s.ids.length) { FC.sess = s; FC.screen = 'session'; FC.show = false; } }
  }
}

// ------------------------------------------------------------------ rendering
const tgl = (on, act, attrs, label, n) => `<button class="tgl ${on ? 'on' : ''}" data-act="${act}" ${attrs} aria-pressed="${!!on}">${esc(label)}${n != null ? ` <i>${n}</i>` : ''}</button>`;

function renderBuild() {
  const sel = FC.sel, today = dayNum(), sk = P.streakInfo();
  const su = studyUnits(), pool = inTopics(), stNames = su.tp.concat(su.sub.map(unitLabel));
  const saved = P.getSession('cards');
  let due = 0, missed = 0;
  const seenU = new Set(); unitCards(su).flat().forEach(c => { if (seenU.has(String(c.id))) return; seenU.add(String(c.id)); const i = P.cardInfo(c.id); if (i.last === 'm') missed++; else if (i.seen && i.due <= today) due++; });
  let h = '';
  if (FC.msg) h += `<div class="note span">${esc(FC.msg)}</div>`;
  h += `<div class="card"><div class="thead"><h2>Today's review</h2><span class="chip ${sk.doneToday ? 'g' : 'n'}">Streak ${sk.n} day${sk.n === 1 ? '' : 's'}${sk.best > sk.n ? ' · best ' + sk.best : ''}</span></div>`;
  h += su.k ? `<div class="mu">Your study topics: ${stNames.map(esc).join(', ')}.<br>${missed + due} card${missed + due === 1 ? '' : 's'} due or missed. Mix: ${quickSize(su.k)} cards, split evenly, Missed first, then Due, Seen, New.</div><div class="btns"><button class="btn pri big" data-act="fcquick">Start today's review (${quickSize(su.k)})</button></div>`
    : '<div class="mu">Mark the topics you are studying right now and get a daily mix of 20 to 30 cards with one tap.</div>';
  h += `<div class="mu sm" style="margin-top:8px">A day counts for the streak when you answer ${STREAK_MIN} cards or finish Today's review.</div></div>`;

  h += `<div class="card"><div class="thead"><h3>My study topics</h3><button class="link" data-act="fcedit">${FC.editStudy ? 'Done' : 'Edit'}</button></div>`;
  if (FC.editStudy) h += `<div class="mu sm" style="margin-bottom:8px">Tick the topics, or just some subtopics, you are studying now. Change it whenever you move on (for example day 1: OSPF, day 2: OSPF + FHRP + Multicast).</div>` + topicPicker(Object.assign(FC.stt, { tpOpen: true }), pickerCfg('fcstudy', o => P.setStudyTopics(o.tp, o.sub)));
  else h += stNames.length ? `<div class="tgls">${stNames.map(t => `<span class="tgl on static">${esc(t)}</span>`).join('')}</div>` : '<div class="mu">None yet. Tap Edit.</div>';
  h += '</div>';

  if (saved && saved.ids && saved.i < saved.ids.length) h += `<div class="card resume span"><b>Unfinished flashcard session</b><div class="mu">Card ${saved.i + 1} of ${saved.ids.length}. Saved to your account.</div><div class="btns"><button class="btn pri" data-act="fcresume">Resume</button><button class="btn" data-act="fcdiscard">Discard</button></div></div>`;

  const preset = SIZES.includes(sel.count), ids = builderIds(), nMatch = pool.filter(c => matches(c, sel.types)).length;
  h += `<div class="card span"><h2>Build a session</h2>
<h4 class="sub">Topics and subtopics</h4>
${topicPicker(sel, pickerCfg('fc', null, `<button class="chipbtn" data-act="fcmine" ${su.k ? '' : 'disabled'}>My study topics</button>`))}
<h4 class="sub">Card types <span class="mu sm">combine as you like</span></h4>
<div class="tgls">${TYPES.map(([k, l]) => tgl(sel.types.includes(k), 'fctype', `data-k="${k}"`, l, pool.filter(c => cats(c)[k]).length)).join('')}</div>
<h4 class="sub">How many cards</h4>
<div class="tgls">${SIZES.map(n => tgl(sel.count === n, 'fccount', `data-n="${n}"`, n === 'all' ? 'All' : String(n))).join('')}<label class="fld">Other <input type="number" id="fccustom" min="1" max="3225" inputmode="numeric" placeholder="e.g. 15" value="${preset ? '' : sel.count}"></label></div>
<h4 class="sub">Order</h4>
<div class="tgls">${tgl(sel.order === 'shuffle', 'fcorder', 'data-o="shuffle"', 'Shuffled')}${tgl(sel.order === 'topic', 'fcorder', 'data-o="topic"', 'By topic')}</div>
<div class="note"><b>${ids.length}</b> card${ids.length === 1 ? '' : 's'} in this session${ids.length < nMatch ? ` (${nMatch} match, limited by the number you chose)` : ''}.</div>
<div class="btns"><button class="btn pri big" data-act="fcstart" ${ids.length ? '' : 'disabled'}>Start session</button></div></div>`;

  h += `<div class="card span"><h3>Progress by topic</h3><div class="mu sm" style="margin-bottom:6px">Bar = cards you last answered Got it. Tap a topic to add or remove it in the builder.</div>` +
    D.cardTopics.map(x => { let k = 0, d = 0; x.ids.forEach(id => { const i = P.cardInfo(id); if (i.last === 'g') k++; if (i.seen && i.due <= today) d++; }); return `<button class="fcrow ${sel.tp.includes(x.t) ? 'on' : ''}" data-act="fctog" data-t="${esc(x.t)}"><span>${esc(x.t)}</span><span class="fcbar"><i style="width:${x.n ? k / x.n * 100 : 0}%"></i></span><span>${k}/${x.n}${d ? ` · ${d} due` : ''}</span></button>`; }).join('') +
    `<div class="btns"><button class="btn danger" data-act="fcreset">Reset flashcard progress${selIds(sel, 'c') ? ' for the selected topics' : ''}</button></div>` +
    (FC.reset ? `<div class="note bad">Clear Got it / Missed marks and due dates for ${selIds(sel, 'c') ? 'the selected topics' : 'all flashcards'}? Stars are kept. Question progress is not affected.<div class="btns"><button class="btn danger" data-act="fcresetok">Yes, reset</button><button class="btn" data-act="fcresetno">Cancel</button></div></div>` : '') + '</div>';
  return h;
}

function renderSession() {
  const s = FC.sess, id = s.ids[s.i], c = byId.get(id), i = P.cardInfo(id);
  return `<div class="prog"><span>Card ${s.i + 1} of ${s.ids.length}</span><span class="pbar"><i style="width:${s.i / s.ids.length * 100}%"></i></span></div>
<div class="fcstats"><span class="ok">Got it ${s.got.length}</span><span class="no">Missed ${s.missed.length}</span><span>Skipped ${s.skipped.length}</span></div>
<div class="fcstage"><div class="fcard ${FC.anim}" id="fcard" data-show="${FC.show ? 1 : 0}"><div class="meta"><span class="tpc">${esc(c.t)}</span>${c.n && c.n !== '0' ? '<span class="tag wa">v1.2</span>' : ''}${i.last === 'm' ? '<span class="tag wa">Missed before</span>' : ''}${!i.seen ? '<span class="tag">New</span>' : ''}<button class="star ${i.star ? 'on' : ''}" data-act="fcstar" aria-label="Star this card" aria-pressed="${i.star}">${icon('star')}</button></div>
<div class="fcside">${FC.show ? 'ANSWER' : 'QUESTION'}</div><div class="fc">${fcHtml(FC.show ? c.b : c.f)}</div></div></div>
<div class="fchint">${FC.show ? 'Swipe right = Got it · swipe left = Missed it' : 'Tap the card or press Space to flip'}</div>
<div class="fcbtns">${FC.show ? `<button class="btn warn big" data-act="fcmiss">${icon('again')} Missed it</button><button class="btn pri big" data-act="fcgot">${icon('check')} Got it</button>` : '<button class="btn pri big wide" data-act="fcshow">Show answer</button>'}</div>
<div class="fcnav"><button class="btn sm" data-act="fcskip">Skip ${icon('right')}</button><button class="btn sm" data-act="fcend">End session</button></div>`;
}

function renderEnd() {
  const s = FC.sess, sk = P.streakInfo(), done = s.got.length + s.missed.length, pc = done ? Math.round(s.got.length / done * 100) : 0;
  return `<div class="card"><div class="mu">${s.quick ? "Today's review" : 'Session'} finished</div><div class="score">${s.got.length}<small> got it</small></div>
<table><tr><th>Got it</th><th>Missed</th><th>Skipped</th><th>Score</th></tr><tr><td>${s.got.length}</td><td>${s.missed.length}</td><td>${s.skipped.length}</td><td>${pc}%</td></tr></table>
<div class="note">Missed cards come back tomorrow. Cards you got right return after 1, 3, 7, then 14 days.</div>
<div class="chip ${sk.doneToday ? 'g' : 'n'}" style="display:inline-block">Daily streak: ${sk.n} day${sk.n === 1 ? '' : 's'}${sk.doneToday ? '' : ` (answer ${Math.max(0, STREAK_MIN - P.cardsAnsweredToday())} more cards today to count this day)`}</div>
<div class="btns">${s.missed.length ? `<button class="btn pri" data-act="fcretry">Retry missed cards (${s.missed.length})</button>` : ''}<button class="btn ${s.missed.length ? '' : 'pri'}" data-act="fcback">Back to flashcards</button><button class="btn" data-act="gohome">Home</button></div></div>`;
}

export const wideScreen = () => FC.screen === 'build' || !FC.sess;
export function render() {
  if (!D.cardTopics.length) return '<div class="card"><h2>Flashcards</h2><p class="mu">There are no flashcards in the data.</p></div>';
  if (FC.screen === 'session' && FC.sess) return renderSession();
  if (FC.screen === 'end' && FC.sess) return renderEnd();
  return renderBuild();
}

// ------------------------------------------------------------------ actions
export async function handle(a, b) {
  const sel = FC.sel, d = (b && b.dataset) || {};
  if (a === 'gohome') { await App.go('home'); return false; }
  if (a === 'fcquick') { startQuick(); return true; }
  if (a === 'fcstart') { const cu = document.querySelector('#fccustom'); if (cu && cu.value) sel.count = Math.max(1, parseInt(cu.value) || 20); begin(builderIds(), false); return true; }
  if (a === 'fcresume') { const s = P.getSession('cards'); if (s) { s.ids = s.ids.filter(id => byId.has(id)); FC.sess = s; FC.screen = 'session'; FC.show = false; scrollTo(0, 0); } return true; }
  if (a === 'fcdiscard') { P.setSession('cards', null); return true; }
  if (a === 'fcshow') { if (FC.screen !== 'session' || FC.show) return true; FC.show = true; FC.anim = 'flip'; return true; }
  if (a === 'fcgot' || a === 'fcmiss') { if (FC.screen === 'session') answer(a === 'fcgot'); return true; }
  if (a === 'fcskip') { const s = FC.sess; if (s && FC.screen === 'session') { s.skipped.push(s.ids[s.i]); advance(); } return true; }
  if (a === 'fcend') { const s = FC.sess; if (s) { s.skipped.push(...s.ids.slice(s.i)); s.i = s.ids.length; finish(); } return true; }
  if (a === 'fcstar') { const s = FC.sess; if (s) P.toggleStar(s.ids[s.i]); return true; }
  if (a === 'fcretry') { begin(shuf(FC.sess.missed.slice()), false); return true; }
  if (a === 'fcback') { FC.screen = 'build'; FC.sess = null; scrollTo(0, 0); return true; }
  if (topicAction(a, b)) return true;
  if (a === 'fctog') { const t = d.t; sel.tp = sel.tp.includes(t) ? sel.tp.filter(x => x !== t) : sel.tp.concat(t); sel.sub = sel.sub.filter(k => !k.startsWith(t + '||')); return true; }
  if (a === 'fcmine') { const u = studyUnits(); sel.tp = u.tp.slice(); sel.sub = u.sub.slice(); return true; }
  if (a === 'fctype') {
    const k = d.k;
    if (k === 'all') sel.types = ['all'];
    else { let t = sel.types.filter(x => x !== 'all'); t = t.includes(k) ? t.filter(x => x !== k) : t.concat(k); sel.types = t.length ? t : ['all']; }
    return true;
  }
  if (a === 'fccount') { sel.count = d.n === 'all' ? 'all' : +d.n; return true; }
  if (a === 'fcorder') { sel.order = d.o; return true; }
  if (a === 'fcedit') { FC.editStudy = !FC.editStudy; FC.msg = ''; return true; }
  if (a === 'fcreset') { FC.reset = true; return true; }
  if (a === 'fcresetno') { FC.reset = false; return true; }
  if (a === 'fcresetok') { const ss = selIds(sel, 'c'); P.clearCards(D.cardTopics.flatMap(t => t.ids).filter(id => !ss || ss.has(String(id)))); FC.reset = false; return true; }
  return false;
}
export function change(id, v) {
  if (id === 'fccustom') { const n = parseInt(v); if (n > 0) FC.sel.count = n; return true; }
  return false;
}
export function key(e) {
  if (FC.screen !== 'session' || !FC.sess) return false;
  const btn = e.target.closest && e.target.closest('button');
  if ((e.key === ' ' || e.key === 'Enter') && !btn && !FC.show) { e.preventDefault(); return handle('fcshow'); }
  if (e.key === 'ArrowRight') return handle('fcskip');
  if (FC.show && e.key === '1') return handle('fcmiss');
  if (FC.show && e.key === '2') return handle('fcgot');
  if (e.key.toLowerCase() === 's' && !btn) return handle('fcstar');
  return false;
}

// Tap to flip + swipe gestures on the card (called after every render).
export function bind(root) {
  const el = root.querySelector('#fcard'); if (!el) return;
  let x0 = null, y0 = 0, dx = 0, moved = false;
  el.addEventListener('pointerdown', e => { if (e.target.closest('.star')) { x0 = null; return; } x0 = e.clientX; y0 = e.clientY; dx = 0; moved = false; el.style.transition = 'none'; });
  el.addEventListener('pointermove', e => {
    if (x0 === null) return; dx = e.clientX - x0; const dy = e.clientY - y0;
    if (!moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) moved = true;
    if (moved && FC.show) { el.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)`; el.classList.toggle('good', dx > 40); el.classList.toggle('bad', dx < -40); }
  });
  const end = () => {
    if (x0 === null) return; x0 = null; el.style.transition = '';
    if (moved && Math.abs(dx) > 90 && FC.show) { App.dispatch(dx > 0 ? 'fcgot' : 'fcmiss'); return; }
    el.style.transform = ''; el.classList.remove('good', 'bad');
    if (moved && !FC.show && Math.abs(dx) > 90) { el.classList.add('shake'); return; }
    if (!moved && !FC.show && !(window.getSelection && String(window.getSelection()))) App.dispatch('fcshow');
    else if (!moved && FC.show) { FC.show = false; FC.anim = 'flip'; App.render(); }
  };
  el.addEventListener('pointerup', e => { if (e.target.closest && (e.target.closest('img') || e.target.closest('.star'))) { x0 = null; el.style.transition = ''; return; } end(); });
  el.addEventListener('pointercancel', () => { x0 = null; el.style.transform = ''; });
}
