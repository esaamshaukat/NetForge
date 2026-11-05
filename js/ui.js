// Shared UI pieces: icons, question rendering, topic picker, action bar.
import { esc } from './util.js';
import { D, imgTag, info, subsOf, selIds } from './data.js';

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
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z"/>',
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

// ---------- topic picker: topics with expandable subtopics, tick boxes and a search box ----------
// o   = selection state {tp:[topic names], sub:["topic||subtopic"], tpOpen, q, exp:[topics shown expanded]}
// cfg = {pk (unique id of this picker), kind:'q'|'c', topics:[{name, ids}], count(ids)->number, info(name), onChange(o)}
const reg = new Map();
const keyOf = (t, s) => t + '||' + s;
const subIds = (e, kind) => (kind === 'c' ? e.c : e.q) || [];
const norm = x => String(x || '').toLowerCase();

function counts(cfg) {
  const m = {};
  cfg.topics.forEach(t => { m[t.name] = cfg.count(t.ids); });
  return m;
}
function rowTopic(o, cfg, t, n, withExp) {
  const subs = subsOf(t.name).filter(e => cfg.count(subIds(e, cfg.kind)) > 0), whole = o.tp.includes(t.name);
  const some = !whole && subs.some(e => o.sub.includes(keyOf(t.name, e.name)));
  const open = o.exp.includes(t.name);
  let h = `<div class="tprow"><label class="tp"><input type="checkbox" data-act="tp" data-pk="${cfg.pk}" data-t="${esc(t.name)}" ${whole ? 'checked' : ''} ${some ? 'data-ind="1"' : ''}><span><b>${esc(t.name)}</b> <i>${n}</i>${cfg.info && cfg.info(t.name) ? `<small>${esc(cfg.info(t.name))}</small>` : ''}</span></label>` +
    (withExp && subs.length ? `<button class="exp ${open ? 'on' : ''}" data-act="tpexp" data-pk="${cfg.pk}" data-t="${esc(t.name)}" aria-expanded="${open}" aria-label="${open ? 'Hide' : 'Show'} subtopics of ${esc(t.name)}">${subs.length} <span>${open ? '▾' : '▸'}</span></button>` : '') + '</div>';
  if (withExp && open) h += '<div class="subs">' + subs.map(e => subRow(o, cfg, t.name, e, '')).join('') + '</div>';
  return h;
}
function subRow(o, cfg, tn, e, hint) {
  const on = o.tp.includes(tn) || o.sub.includes(keyOf(tn, e.name));
  return `<label class="tp sub"><input type="checkbox" data-act="sb" data-pk="${cfg.pk}" data-t="${esc(tn)}" data-s="${esc(e.name)}" ${on ? 'checked' : ''}><span>${esc(e.name)} <i>${cfg.count(subIds(e, cfg.kind))}</i>${hint ? `<small>${hint}</small>` : ''}</span></label>`;
}
function search(o, cfg) {
  const toks = norm(o.q).split(/\s+/).filter(Boolean), res = [];
  const hit = (name, kws) => { const nm = norm(name), kw = kws.map(norm); let byName = true; for (const t of toks) { if (!nm.includes(t)) { byName = false; if (!kw.some(k => k.includes(t))) return null; } } return byName ? 2 : 1; };
  cfg.topics.forEach(t => {
    const n = cfg.count(t.ids); if (!n) return;
    const sc = hit(t.name, []); if (sc) res.push({ sc: sc + 1, h: rowTopic(o, cfg, t, n, false) });
    subsOf(t.name).forEach(e => {
      const c = cfg.count(subIds(e, cfg.kind)); if (!c) return;
      const sc2 = hit(t.name + ' ' + e.name, e.kw || []);
      if (!sc2) return;
      const nameHit = toks.every(k => norm(e.name).includes(k));
      const via = nameHit ? '' : 'matches: ' + esc((e.kw || []).filter(k => toks.some(x => norm(k).includes(x))).slice(0, 3).join(', '));
      res.push({ sc: nameHit ? 3 : 1, h: subRow(o, cfg, t.name, e, `in ${esc(t.name)}${via ? ' · ' + via : ''}`) });
    });
  });
  res.sort((a, b) => b.sc - a.sc);
  if (!res.length) return `<div class="mu" style="padding:10px 2px">Nothing matches "${esc(o.q)}". Try a shorter word, for example "syslog" or "ospf".</div>`;
  return `<div class="mu sm" style="margin:6px 0">${res.length} result${res.length === 1 ? '' : 's'}${res.length > 40 ? ' (showing 40)' : ''}</div>` + res.slice(0, 40).map(r => r.h).join('');
}
function listHtml(o, cfg) {
  if (norm(o.q).trim()) return search(o, cfg);
  const c = counts(cfg);
  return cfg.topics.filter(t => c[t.name] > 0).map(t => rowTopic(o, cfg, t, c[t.name], true)).join('');
}
function summary(o, cfg) {
  const ids = cfg.kind === 'c' ? selIds(o, 'c') : selIds(o, 'q');
  const n = ids ? cfg.count([...ids]) : cfg.topics.reduce((a, t) => a + cfg.count(t.ids), 0);
  const parts = [];
  if (o.tp.length) parts.push(o.tp.length + ' topic' + (o.tp.length > 1 ? 's' : ''));
  if (o.sub.length) parts.push(o.sub.length + ' subtopic' + (o.sub.length > 1 ? 's' : ''));
  return { lbl: parts.length ? parts.join(' + ') + ' selected' : 'All topics', n };
}
export function topicPicker(o, cfg) {
  o.tp = o.tp || []; o.sub = o.sub || []; o.exp = o.exp || []; o.q = o.q || '';
  reg.set(cfg.pk, { o, cfg });
  const sm = summary(o, cfg);
  let h = `<div class="card tpbox"><button class="tpbtn" data-act="tpopen" data-pk="${cfg.pk}" aria-expanded="${!!o.tpOpen}"><span><b>${sm.lbl}</b> <span class="mu">· ${sm.n} ${cfg.kind === 'c' ? 'card' : 'question'}${sm.n === 1 ? '' : 's'}</span></span><span class="link">${o.tpOpen ? 'Hide list' : 'Choose topics'}</span></button>`;
  if (o.tpOpen) h += `<div class="tpsearch"><input type="search" class="tpq" data-pk="${cfg.pk}" placeholder="Search topics and subtopics, e.g. syslog" value="${esc(o.q)}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search topics and subtopics"></div>
<div class="chiprow"><button class="chipbtn" data-act="tpall" data-pk="${cfg.pk}">Select all topics</button><button class="chipbtn" data-act="tpclr" data-pk="${cfg.pk}">Clear (use all)</button>${cfg.extraChips || ''}</div>
<div class="tplistbox" id="tplist-${cfg.pk}">${listHtml(o, cfg)}</div>`;
  return h + '</div>';
}
// live search without re-drawing the whole page (keeps the cursor in the box)
export function pickerSearch(pk, value) {
  const r = reg.get(pk); if (!r) return;
  r.o.q = value;
  const box = document.getElementById('tplist-' + pk); if (box) { box.innerHTML = listHtml(r.o, r.cfg); fixIndeterminate(box); }
}
export function fixIndeterminate(root) { root.querySelectorAll('input[data-ind]').forEach(x => { x.indeterminate = true; }); }

// Handles the picker's buttons and tick boxes. Returns null if the action is not a picker action,
// otherwise {pk, changed} (changed = the selection itself changed, so lists must be rebuilt).
export function topicAction(a, b) {
  if (!['tp', 'sb', 'tpall', 'tpclr', 'tpopen', 'tpexp'].includes(a)) return null;
  const pk = b.dataset && b.dataset.pk, r = reg.get(pk); if (!r) return null;
  const { o, cfg } = r, t = b.dataset.t, s = b.dataset.s;
  let changed = false;
  if (a === 'tpopen') o.tpOpen = !o.tpOpen;
  else if (a === 'tpexp') o.exp = o.exp.includes(t) ? o.exp.filter(x => x !== t) : o.exp.concat(t);
  else if (a === 'tpall') { o.tp = cfg.topics.map(x => x.name); o.sub = []; changed = true; }
  else if (a === 'tpclr') { o.tp = []; o.sub = []; changed = true; }
  else if (a === 'tp') {
    if (o.tp.includes(t)) o.tp = o.tp.filter(x => x !== t); else o.tp = o.tp.concat(t);
    o.sub = o.sub.filter(k => !k.startsWith(t + '||')); changed = true;
  } else if (a === 'sb') {
    const k = keyOf(t, s), all = subsOf(t).filter(e => cfg.count(subIds(e, cfg.kind)) > 0).map(e => keyOf(t, e.name));
    if (o.tp.includes(t)) { o.tp = o.tp.filter(x => x !== t); o.sub = o.sub.filter(x => !x.startsWith(t + '||')).concat(all.filter(x => x !== k)); }
    else if (o.sub.includes(k)) o.sub = o.sub.filter(x => x !== k);
    else { o.sub = o.sub.concat(k); if (all.every(x => o.sub.includes(x))) { o.sub = o.sub.filter(x => !x.startsWith(t + '||')); o.tp = o.tp.concat(t); } }
    changed = true;
  }
  if (changed && cfg.onChange) cfg.onChange(o);
  return { pk, changed };
}
