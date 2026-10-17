// Study mode: go through questions by topic, Check, then read the explanation.
import { esc, same, shuf, idCmp } from './util.js';
import { D, ensure, getQ } from './data.js';
import * as P from './sync.js';
import { App, icon, actionBar, qBody, opts, explHtml, result, noKeyNote, topicPicker, topicAction } from './ui.js';

export const S = { tp: [], tpOpen: false, shuffle: false, filter: 'all', ids: [], i: 0, sel: [], checked: false, expl: false, graded: '' };

const countFor = t => (D.topics.find(x => x.name === t) || { ids: [] }).ids.length;

export function buildList(keepId) {
  let ids = [];
  D.topics.forEach(t => { if (!S.tp.length || S.tp.includes(t.name)) ids = ids.concat(t.ids); });
  if (S.filter === 'new') ids = ids.filter(id => !P.getStat(id));
  else if (S.filter === 'wrong') ids = ids.filter(id => (P.getStat(id) || {}).last === 'w');
  else if (S.filter === 'flagged') ids = ids.filter(id => P.isFlag(id));
  ids.sort(idCmp);
  S.ids = S.shuffle ? shuf(ids) : ids;
  const at = keepId ? S.ids.indexOf(keepId) : -1;
  S.i = at >= 0 ? at : 0; S.sel = []; S.checked = false; S.expl = false; S.graded = '';
}
const save = () => P.setSession('study', { tp: S.tp, filter: S.filter, shuffle: S.shuffle, i: S.i, qid: S.ids[S.i] || '', ids: S.shuffle ? S.ids : null });

export async function open(resume) {
  if (resume) {
    const s = P.getSession('study');
    if (s) { S.tp = s.tp || []; S.filter = s.filter || 'all'; S.shuffle = !!s.shuffle; await ensure(S.tp); buildList(s.qid); if (s.shuffle && s.ids) { S.ids = s.ids; S.i = Math.max(0, S.ids.indexOf(s.qid)); } return; }
  }
  await ensure(S.tp);
  if (!S.ids.length) buildList();
}

export function render() {
  const q = getQ(S.ids[S.i]);
  let h = topicPicker(S, countFor) + `<div class="bar"><label class="fld">Show <select id="sfilter"><option value="all" ${S.filter === 'all' ? 'selected' : ''}>All questions</option><option value="new" ${S.filter === 'new' ? 'selected' : ''}>Not attempted yet</option><option value="wrong" ${S.filter === 'wrong' ? 'selected' : ''}>Last answered wrong</option><option value="flagged" ${S.filter === 'flagged' ? 'selected' : ''}>My flagged (${P.flagCount()})</option></select></label>
<label class="chk"><input type="checkbox" id="shuf" ${S.shuffle ? 'checked' : ''}> Shuffle</label></div>`;
  if (!q) return h + '<div class="card empty">No questions match these choices.</div>';
  const fl = P.isFlag(q.id);
  h += `<div class="prog"><span>Question ${S.i + 1} of ${S.ids.length}</span><span class="pbar"><i style="width:${(S.i + 1) / S.ids.length * 100}%"></i></span></div><div class="card">${qBody(q, fl)}`;
  if (q.type === 'mcq') {
    h += opts(q, S.sel, S.checked);
    if (S.checked) h += q.noKey ? noKeyNote : result(same(S.sel, q.correctAnswer), q);
  }
  if (S.expl) h += explHtml(q);
  if (q.type === 'lab' && S.expl) h += S.graded ? `<div class="res ${S.graded === 'c' ? 'ok' : 'no'}">Recorded: ${S.graded === 'c' ? 'you got it right' : 'you got it wrong'}.</div>` :
    `<div class="note">Lab questions cannot be checked automatically. Compare with the solution above, then record how you did:<div class="btns"><button class="btn" data-act="sgrade" data-v="c">I got it right</button><button class="btn" data-act="sgrade" data-v="w">I got it wrong</button></div></div>`;
  h += '</div>';
  h += actionBar([
    { act: 'prev', icon: 'left', label: 'Previous', disabled: !S.i },
    q.type === 'mcq' ? { act: 'check', icon: 'check', label: 'Check', cls: 'pri', disabled: !S.sel.length || S.checked } : { act: 'expl', icon: 'bulb', label: S.expl ? 'Hide' : 'Solution', cls: 'pri' },
    ...(q.type === 'mcq' ? [{ act: 'expl', icon: 'bulb', label: 'Explanation', cls: S.expl ? 'on' : '' }] : []),
    { act: 'flag', icon: 'flag', label: fl ? 'Flagged' : 'Flag', cls: fl ? 'on warn' : '' },
    { act: 'next', icon: 'right', label: 'Next', cls: S.checked ? 'pri' : '', disabled: S.i >= S.ids.length - 1 }
  ]);
  return h;
}

export function handle(a, b) {
  const q = getQ(S.ids[S.i]);
  if (topicAction(a, b, S, D.topics.map(t => t.name))) { if (a !== 'tpopen') { buildList(); save(); } return true; }
  if (a === 'pick' && q) { if (S.checked) return true; const k = b.dataset.k; S.sel = q.correctAnswer.length > 1 ? (S.sel.includes(k) ? S.sel.filter(x => x !== k) : S.sel.concat(k)) : [k]; return true; }
  if (a === 'check' && q) { if (S.checked || !S.sel.length) return true; S.checked = true; if (!q.noKey) P.rec(q.id, 's', same(S.sel, q.correctAnswer)); return true; }
  if (a === 'expl') { S.expl = !S.expl; return true; }
  if (a === 'sgrade' && q) { if (S.graded) return true; S.graded = b.dataset.v; P.rec(q.id, 's', S.graded === 'c'); return true; }
  if (a === 'flag' && q) { P.setFlag(q.id, !P.isFlag(q.id)); return true; }
  if (a === 'prev' || a === 'next') { const n = S.i + (a === 'next' ? 1 : -1); if (n < 0 || n >= S.ids.length) return true; S.i = n; S.sel = []; S.checked = false; S.expl = false; S.graded = ''; save(); scrollTo(0, 0); return true; }
  return false;
}
export function change(id, v) {
  if (id === 'shuf') { S.shuffle = v; buildList(); save(); return true; }
  if (id === 'sfilter') { S.filter = v; buildList(); save(); return true; }
  return false;
}
export function key(e) {
  const k = e.key.toLowerCase(), q = getQ(S.ids[S.i]);
  if (!q) return false;
  if (k === 'arrowright') return handle('next', {});
  if (k === 'arrowleft') return handle('prev', {});
  if (k === 'enter') { if (q.type === 'mcq' && !S.checked && S.sel.length) return handle('check', {}); return handle('next', {}); }
  if (k === 'e') return handle('expl', {});
  if (k === 'f') return handle('flag', {});
  if (q.type === 'mcq' && /^[a-h]$/.test(k) && q.options[k.toUpperCase()] !== undefined) return handle('pick', { dataset: { k: k.toUpperCase() } });
  return false;
}
