// Small helpers shared by all modules.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const shuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
export const fmt = s => { s = Math.max(0, s | 0); const h = s / 3600 | 0, m = (s % 3600) / 60 | 0, x = s % 60, p = n => String(n).padStart(2, '0'); return (h ? h + ':' : '') + p(m) + ':' + p(x); };
export const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
export const idCmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
