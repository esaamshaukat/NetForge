// Loads the encrypted data files on demand and decrypts them in memory.
import { decryptFile } from './crypto.js';
import { esc } from './util.js';

export const D = {
  key: null, manifest: null, meta: null,
  topics: [],            // [{name,file,ids,labs,noKey,info}]
  topicOf: new Map(),    // question id -> topic name
  Q: new Map(),          // question id -> question (only the topics loaded so far)
  noKey: new Set(), labs: new Set(),
  cardTopics: [],        // [{t,n,file,ids}]
  version: ''
};
const topicP = new Map(), packP = new Map(), cardP = new Map();
let baseMap = null;

async function fetchEnc(name) {
  const f = D.manifest.files[name];
  if (!f) throw new Error('Missing data file: ' + name);
  const r = await fetch(`data/${name}?v=${f.v}`);
  if (!r.ok) throw new Error('Could not download ' + name + ' (' + r.status + ')');
  return r.arrayBuffer();
}
const getJSON = async name => decryptFile(await fetchEnc(name), D.key);

export function reset() {
  D.key = D.manifest = D.meta = null; D.topics = []; D.cardTopics = [];
  D.topicOf.clear(); D.Q.clear(); D.noKey.clear(); D.labs.clear();
  topicP.clear(); packP.clear(); cardP.clear(); baseMap = null;
}

export async function init(key) {
  reset();
  D.key = key;
  const r = await fetch('data/data-manifest.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('Could not download the data list (' + r.status + ').');
  D.manifest = await r.json();
  D.meta = await getJSON('meta.enc');      // throws if the key is wrong
  D.version = D.manifest.dataVersion;
  D.topics = D.meta.topics;
  D.cardTopics = D.meta.cardTopics || [];
  D.topics.forEach(t => {
    t.ids.forEach(id => D.topicOf.set(id, t.name));
    t.noKey.forEach(id => D.noKey.add(id));
    t.labs.forEach(id => D.labs.add(id));
  });
  keepOnly();
}

// Tell the service worker which data files are current so old ones can be dropped.
function keepOnly() {
  try {
    const urls = Object.entries(D.manifest.files).map(([n, f]) => `data/${n}?v=${f.v}`);
    navigator.serviceWorker && navigator.serviceWorker.controller &&
      navigator.serviceWorker.controller.postMessage({ type: 'KEEP_DATA', urls });
  } catch (e) { /* not important */ }
}

export function norm(r) {
  let ca = r.correctAnswer;
  if (typeof ca === 'string') ca = ca.split(/[,\s]+/).filter(Boolean);
  return Object.assign({}, r, {   // every original field (flags, sourcePage, ...) is kept
    id: String(r.id), topic: r.topic || 'Uncategorized', type: r.type === 'lab' ? 'lab' : 'mcq',
    question: r.question || '', options: r.options || {}, correctAnswer: ca || [],
    explanation: r.explanation || '', images: r.images || [], optionImages: r.optionImages || {},
    noKey: (r.type !== 'lab' && !(ca && ca.length))
  });
}

async function loadTopic(name) {
  if (!topicP.has(name)) {
    const t = D.topics.find(x => x.name === name);
    if (!t) return;
    topicP.set(name, getJSON(t.file).then(d => d.questions.forEach(r => D.Q.set(String(r.id), norm(r)))).catch(e => { topicP.delete(name); throw e; }));
  }
  return topicP.get(name);
}
// names = list of topic names; empty/omitted = all topics
export const ensure = names => Promise.all((names && names.length ? names : D.topics.map(t => t.name)).map(loadTopic));
export const ensureForIds = ids => ensure([...new Set(ids.map(i => D.topicOf.get(i)).filter(Boolean))]);
export const getQ = id => D.Q.get(id);
export const topicNames = () => D.topics.map(t => t.name);
export const info = name => (D.topics.find(t => t.name === name) || {}).info || '';

// ---- flashcards ----
export async function loadCards(topic) {
  if (!cardP.has(topic)) {
    const t = D.cardTopics.find(x => x.t === topic);
    cardP.set(topic, t ? getJSON(t.file).then(d => d.cards).catch(e => { cardP.delete(topic); throw e; }) : Promise.resolve([]));
  }
  return cardP.get(topic);
}
export async function loadAllCards() { return (await Promise.all(D.cardTopics.map(t => loadCards(t.t)))).flat(); }

// ---- pictures: found through the index, loaded in packs, cached by the service worker ----
function packOf(file, kind) {
  const idx = kind === 'c' ? D.meta.cardImages : D.meta.images;
  if (idx[file]) return [idx[file], file];
  let alt = file; try { alt = decodeURIComponent(file); } catch (e) { /* keep */ }
  if (idx[alt]) return [idx[alt], alt];
  const base = String(file).split('/').pop();
  if (kind !== 'c') {
    if (!baseMap) { baseMap = {}; Object.keys(D.meta.images).forEach(k => baseMap[k.split('/').pop()] = k); }
    if (baseMap[base]) return [idx[baseMap[base]], baseMap[base]];
  }
  return null;
}
export async function imageSrc(file, kind = 'q') {
  const p = packOf(file, kind);
  if (!p) return '';
  if (!packP.has(p[0])) packP.set(p[0], getJSON(p[0]).catch(e => { packP.delete(p[0]); throw e; }));
  const pack = await packP.get(p[0]);
  return pack[p[1]] || '';
}
// Fill in every <img data-img="..."> inside root (called after each render).
export function hydrate(root) {
  root.querySelectorAll('img[data-img]').forEach(img => {
    const f = img.getAttribute('data-img'), k = img.getAttribute('data-k') || 'q';
    img.removeAttribute('data-img');
    imageSrc(f, k).then(s => {
      if (s) { img.src = s; img.classList.add('loaded'); }
      else img.replaceWith(Object.assign(document.createElement('div'), { className: 'mu', textContent: '[image not found: ' + f + ']' }));
    }).catch(() => {
      img.replaceWith(Object.assign(document.createElement('div'), { className: 'mu', textContent: '[image could not load - check your connection: ' + f + ']' }));
    });
  });
}
export const imgTag = (f, k = 'q') => `<img data-img="${esc(f)}" data-k="${k}" alt="" title="Click to enlarge" class="pic">`;
