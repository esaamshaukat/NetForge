// Shared UI pieces: icons, question rendering, topic picker, action bar.
import { esc } from './util.js';
import { D, imgTag, info } from './data.js';

// App is a tiny shared object so modules can ask the shell to re-render / navigate.
export const App = { view: 'home', render() {}, go() {}, toast() {}, busy() {}, confirm() {} };

const P = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  study: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/><path d="M9 8h6"/>',
  practice: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  exam: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  cards: '<rect x="3" y="7" width="14" height="12" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  pause: '<path d="M8 5v14M16 5v14"/>', play: '<path d="M7 4l13 8-13 8z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', grid: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>', flagoff: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4l2-2"/><path d="M20 20v-5h-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', again: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/>'
};
export const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

// Fixed action bar. items: {act, icon, label, cls, disabled, data, end}
export function actionBar(items) {
  return `<div class="actionbar" role="toolbar">${items.map(b => b === '|' ? '<span class="sep"></span>' :
    `<button class="ab ${b.cls || ''}" data-act="${b.act}" ${b.data || ''} ${b.disabled ? 'disabled' : ''} ${b.title ? `title="${esc(b.title)}"` : ''}>${icon(b.icon)}<span>${esc(b.label)}</span></button>`).join('')}</div>`;
}

// ---------- question rendering ----------
function srcInfo(q) {
  const f = Array.isArray(q.flags) ? q.flags : [];
  if (!q.sourcePage && !f.length) return '';
  return `<details class="src"><summary>Source and review notes</summary><div class="srcb">${q.sourcePage ? `<div>PDF page ${esc(q.sourcePage)}</div>` : ''}${f.length ? `<ul>${f.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div></details>`;
}
export function qBody(q, flagged) {
  const multi = q.correctAnswer.length > 1;
  const hasImg = q.images.some(i => i.role !== 'answer') || Object.keys(q.optionImages || {}).length;
  return `<div class="meta"><span class="qid">${esc(q.id)}</span><span class="tpc">${esc(q.topic)}</span>${q.type === 'lab' ? '<span class="tag">Lab</span>' : ''}${multi ? `<span class="tag">Choose ${q.correctAnswer.length}</span>` : ''}${q.noKey ? '<span class="tag wa">No answer key</span>' : ''}${flagged ? '<span class="tag wa">Flagged</span>' : ''}</div>
<div class="q">${esc(q.question)}</div>` + q.images.filter(i => i.role !== 'answer').map(i => imgTag(i.file)).join('') + (hasImg ? '<div class="zoomhint">Tap a picture to enlarge it.</div>' : '');
}
export function opts(q, sel, checked) {
  const t = q.correctAnswer.length > 1 ? 'checkbox' : 'radio';
  return Object.entries(q.options).map(([k, v]) => {
    const c = q.correctAnswer.includes(k), s = sel.includes(k);
    let cl = 'opt'; if (checked) { if (c) cl += ' ok' + (s ? '' : ' miss'); else if (s) cl += ' no'; } else if (s) cl += ' sel';
    return `<label class="${cl}"><input type="${t}" name="o" data-act="pick" data-k="${k}" ${s ? 'checked' : ''} ${checked ? 'disabled' : ''}><b>${k}</b><span>${v ? esc(v) : ''}${q.optionImages && q.optionImages[k] ? imgTag(q.optionImages[k]) : ''}</span></label>`;
  }).join('');
}
export function explHtml(q) {
  const a = q.images.filter(i => i.role === 'answer');
  let h = a.map(i => imgTag(i.file)).join('');
  if (q.explanation) h += `<div class="ex-t">${esc(q.explanation)}</div>`;
  if (!h) h = '<div class="ex-t mu">No explanation provided for this question.</div>';
  return `<div class="expl"><h4>${q.type === 'lab' ? 'Explanation and solution' : 'Explanation'}</h4>${h}</div>`;
}
export const result = (ok, q) => `<div class="res ${ok ? 'ok' : 'no'}">${ok ? 'Correct' : 'Incorrect. Correct answer: ' + q.correctAnswer.join(', ')}</div>`;
export const noKeyNote = '<div class="res">No answer key: the source PDF does not give a clear correct answer for this question. Compare your choice with the explanation.</div>';

// ---------- topic picker (collapsible list of topics with counts) ----------
// o = {tp:[], tpOpen:bool}; count(topicName) = number of questions available in that topic
export function topicPicker(o, count) {
  const ts = D.topics.map(t => t.name).filter(t => count(t) > 0);
  const n = o.tp.length ? o.tp.reduce((a, t) => a + count(t), 0) : ts.reduce((a, t) => a + count(t), 0);
  const lbl = o.tp.length ? o.tp.length + ' topic' + (o.tp.length > 1 ? 's' : '') + ' selected' : 'All topics';
  let h = `<div class="card tpbox"><button class="tpbtn" data-act="tpopen" aria-expanded="${!!o.tpOpen}"><span><b>${lbl}</b> <span class="mu">· ${n} question${n === 1 ? '' : 's'}</span></span><span class="link">${o.tpOpen ? 'Hide list' : 'Choose topics'}</span></button>`;
  if (o.tpOpen) h += `<div class="chiprow"><button class="chipbtn" data-act="tpall">Select all</button><button class="chipbtn" data-act="tpclr">Clear (use all)</button></div><div class="tplist">` +
    ts.map(t => `<label class="tp"><input type="checkbox" data-act="tp" data-t="${esc(t)}" ${o.tp.includes(t) ? 'checked' : ''}><span><b>${esc(t)}</b> <i>${count(t)}</i>${info(t) ? `<small>${esc(info(t))}</small>` : ''}</span></label>`).join('') + '</div>';
  return h + '</div>';
}
// returns true if it handled the action
export function topicAction(a, b, o, allTopics) {
  if (a === 'tp') { const x = b.dataset.t; o.tp = o.tp.includes(x) ? o.tp.filter(y => y !== x) : o.tp.concat(x); return true; }
  if (a === 'tpall') { o.tp = allTopics.slice(); return true; }
  if (a === 'tpclr') { o.tp = []; return true; }
  if (a === 'tpopen') { o.tpOpen = !o.tpOpen; return true; }
  return false;
}
