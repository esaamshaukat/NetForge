// Flashcards: flip, swipe right = Got it, swipe left = Again.
import { esc, shuf } from './util.js';
import { D, loadCards, loadAllCards } from './data.js';
import * as P from './sync.js';
import { App, icon } from './ui.js';

export const FC = { tp: 'all', filter: 'all', shuffle: false, list: [], i: 0, show: false, reset: false, anim: '', ready: false };
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

let all = [];
export async function open() {
  if (!D.cardTopics.length) { FC.ready = true; return; }
  if (FC.tp === 'all') all = await loadAllCards(); else all = await loadCards(FC.tp);
  pick(); FC.ready = true;
}
const st = c => P.cardState(c.id);
function pick() {
  let l = all.filter(c => FC.tp === 'all' || c.t === FC.tp);
  if (FC.filter === 'learn') l = l.filter(c => st(c) !== 'k'); else if (FC.filter === 'again') l = l.filter(c => st(c) === 'a'); else if (FC.filter === 'new') l = l.filter(c => c.n && c.n !== '0');
  FC.list = FC.shuffle ? shuf(l) : l; FC.i = 0; FC.show = false; FC.reset = false; FC.anim = '';
}

export function render() {
  if (!D.cardTopics.length) return '<div class="card"><h2>Flashcards</h2><p class="mu">There are no flashcards in the data.</p></div>';
  const tot = D.cardTopics.reduce((a, t) => a + t.n, 0);
  const known = D.cardTopics.reduce((a, t) => a + t.ids.filter(id => P.cardState(id) === 'k').length, 0);
  let h = `<div class="bar"><label class="fld">Topic <select id="fctopic"><option value="all">All topics (${tot})</option>${D.cardTopics.map(x => `<option value="${esc(x.t)}" ${FC.tp === x.t ? 'selected' : ''}>${esc(x.t)} (${x.n})</option>`).join('')}</select></label>
<label class="fld">Show <select id="fcfilter"><option value="all" ${FC.filter === 'all' ? 'selected' : ''}>All cards</option><option value="learn" ${FC.filter === 'learn' ? 'selected' : ''}>Still to learn</option><option value="again" ${FC.filter === 'again' ? 'selected' : ''}>Marked Again</option><option value="new" ${FC.filter === 'new' ? 'selected' : ''}>New in the v1.2 update</option></select></label>
<label class="chk"><input type="checkbox" id="fcshuf" ${FC.shuffle ? 'checked' : ''}> Shuffle</label></div>`;
  const c = FC.list[FC.i];
  if (!FC.list.length) h += '<div class="card empty">No cards match this choice. Try another topic or "All cards".</div>';
  else if (!c) {
    const k = FC.list.filter(x => st(x) === 'k').length, a = FC.list.filter(x => st(x) === 'a').length;
    h += `<div class="card"><h2>End of this set</h2><p>You went through ${FC.list.length} cards: <b>${k}</b> marked Got it, <b>${a}</b> marked Again.</p><div class="btns"><button class="btn pri" data-act="fcrestart">Start this set again</button>${FC.filter !== 'learn' ? '<button class="btn" data-act="fclearn">Review only cards still to learn</button>' : ''}<button class="btn" data-act="fcprev">Back to last card</button></div></div>`;
  } else {
    const ms = st(c);
    h += `<div class="prog"><span>Card ${FC.i + 1} of ${FC.list.length}</span><span class="pbar"><i style="width:${(FC.i + 1) / FC.list.length * 100}%"></i></span></div>
<div class="fcstage"><div class="fcard ${FC.anim}" id="fcard" data-show="${FC.show ? 1 : 0}"><div class="meta"><span class="tpc">${esc(c.t)}</span>${c.n && c.n !== '0' ? '<span class="tag wa">NEW</span>' : ''}${c.x && c.x !== '0' ? '<span class="mu">Extra</span>' : ''}${ms ? `<span class="tag ${ms === 'k' ? '' : 'wa'}">${ms === 'k' ? 'Got it' : 'Again'}</span>` : ''}</div>
<div class="fcside">${FC.show ? 'ANSWER' : 'QUESTION'}</div><div class="fc">${fcHtml(FC.show ? c.b : c.f)}</div></div></div>
<div class="fchint">${FC.show ? 'Swipe right = Got it · swipe left = Again' : 'Tap the card or press Space to flip'}</div>
<div class="fcbtns">${FC.show ? `<button class="btn warn big" data-act="fcagain">${icon('again')} Again</button><button class="btn pri big" data-act="fcok">${icon('check')} Got it</button>` : '<button class="btn pri big wide" data-act="fcshow">Show answer</button>'}</div>
<div class="fcnav"><button class="btn sm" data-act="fcprev" ${FC.i ? '' : 'disabled'}>${icon('left')} Previous</button><button class="btn sm" data-act="fcnext">${FC.i < FC.list.length - 1 ? 'Skip' : 'Finish set'} ${icon('right')}</button></div>`;
  }
  h += `<div class="card"><h3>Progress by topic</h3><div class="mu sm" style="margin-bottom:6px">Tap a topic to review just that one.</div>
<button class="fcrow ${FC.tp === 'all' ? 'on' : ''}" data-act="fctp" data-t="all"><span>All topics</span><span class="fcbar"><i style="width:${tot ? known / tot * 100 : 0}%"></i></span><span>${known} / ${tot}</span></button>` +
    D.cardTopics.map(x => { const k = x.ids.filter(id => P.cardState(id) === 'k').length; return `<button class="fcrow ${FC.tp === x.t ? 'on' : ''}" data-act="fctp" data-t="${esc(x.t)}"><span>${esc(x.t)}</span><span class="fcbar"><i style="width:${x.n ? k / x.n * 100 : 0}%"></i></span><span>${k} / ${x.n}</span></button>`; }).join('') +
    `<div class="btns"><button class="btn danger" data-act="fcreset">Reset flashcard progress${FC.tp === 'all' ? '' : ' for this topic'}</button></div>` +
    (FC.reset ? `<div class="note bad">Clear the Got it / Again marks for ${FC.tp === 'all' ? 'all flashcards' : 'this topic'}? Your question progress is not affected.<div class="btns"><button class="btn danger" data-act="fcresetok">Yes, reset</button><button class="btn" data-act="fcresetno">Cancel</button></div></div>` : '') + '</div>';
  return h;
}

export async function handle(a) {
  const c = FC.list[FC.i];
  if (a === 'fcshow') { if (!c || FC.show) return true; FC.show = true; FC.anim = 'flip'; return true; }
  if (a === 'fcok' || a === 'fcagain') { if (!c) return true; P.setCard(c.id, a === 'fcok' ? 'k' : 'a'); FC.i++; FC.show = false; FC.anim = 'next'; scrollTo(0, 0); return true; }
  if (a === 'fcprev') { if (FC.i > 0) { FC.i--; FC.show = false; FC.anim = 'prev'; } return true; }
  if (a === 'fcnext') { if (FC.i < FC.list.length) { FC.i++; FC.show = false; FC.anim = 'next'; } return true; }
  if (a === 'fctp') { FC.tp = arguments[1].dataset.t; await open(); scrollTo(0, 0); return true; }
  if (a === 'fcrestart') { pick(); return true; }
  if (a === 'fclearn') { FC.filter = 'learn'; pick(); return true; }
  if (a === 'fcreset') { FC.reset = true; return true; }
  if (a === 'fcresetno') { FC.reset = false; return true; }
  if (a === 'fcresetok') { const ids = D.cardTopics.filter(t => FC.tp === 'all' || t.t === FC.tp).flatMap(t => t.ids); P.clearCards(ids); pick(); return true; }
  return false;
}
export async function change(id, v) {
  if (id === 'fctopic') { FC.tp = v; await open(); return true; }
  if (id === 'fcfilter') { FC.filter = v; pick(); return true; }
  if (id === 'fcshuf') { FC.shuffle = v; pick(); return true; }
  return false;
}
export function key(e) {
  const c = FC.list[FC.i], btn = e.target.closest && e.target.closest('button');
  if ((e.key === ' ' || e.key === 'Enter') && !btn && c && !FC.show) { e.preventDefault(); return handle('fcshow'); }
  if (e.key === 'ArrowRight') return handle('fcnext');
  if (e.key === 'ArrowLeft') return handle('fcprev');
  if (c && FC.show && e.key === '1') return handle('fcagain');
  if (c && FC.show && e.key === '2') return handle('fcok');
  return false;
}

// Tap to flip + swipe gestures on the card (called after every render).
export function bind(root) {
  const el = root.querySelector('#fcard'); if (!el) return;
  let x0 = null, y0 = 0, dx = 0, moved = false;
  el.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; dx = 0; moved = false; el.style.transition = 'none'; });
  el.addEventListener('pointermove', e => {
    if (x0 === null) return; dx = e.clientX - x0; const dy = e.clientY - y0;
    if (!moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) moved = true;
    if (moved && FC.show) { el.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)`; el.classList.toggle('good', dx > 40); el.classList.toggle('bad', dx < -40); }
  });
  const end = () => {
    if (x0 === null) return; x0 = null; el.style.transition = '';
    if (moved && Math.abs(dx) > 90 && FC.show) { App.dispatch(dx > 0 ? 'fcok' : 'fcagain'); return; }
    el.style.transform = ''; el.classList.remove('good', 'bad');
    if (moved && !FC.show && Math.abs(dx) > 90) { el.classList.add('shake'); return; }
    if (!moved && !FC.show && !(window.getSelection && String(window.getSelection()))) App.dispatch('fcshow');
    else if (!moved && FC.show) { FC.show = false; FC.anim = 'flip'; App.render(); }
  };
  el.addEventListener('pointerup', e => { if (e.target.closest && e.target.closest('img')) { x0 = null; el.style.transition = ''; return; } end(); }); el.addEventListener('pointercancel', () => { x0 = null; el.style.transform = ''; });
}
