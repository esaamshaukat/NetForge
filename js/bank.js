// Which question bank is in use: ExamIce (the original PDF bank), Brave (the screenshot bank), or both.
// The choice is saved with your other settings, so it follows you to your other devices.
import { D, subsOf } from './data.js';
import * as P from './sync.js';

export const BANKS = [['examice', 'ExamIce'], ['brave', 'Brave'], ['both', 'Both']];
export const bankName = b => (BANKS.find(x => x[0] === b) || [0, 'ExamIce'])[1];

// Brave is only offered once the data contains Brave questions (after build.py ran with source/brave.json).
export const hasBrave = () => D.brave.size > 0;
export function bank() {
  const b = P.setting('bank', 'examice');
  return hasBrave() && (b === 'brave' || b === 'both') ? b : 'examice';
}
export const setBank = v => { if (BANKS.some(x => x[0] === v)) P.setSetting('bank', v); };

export const bankOf = id => (D.brave.has(String(id)) ? 'brave' : 'examice');
export const inBank = (id, b = bank()) => b === 'both' || bankOf(id) === b;
export const ofBank = (ids, b = bank()) => (b === 'both' ? ids : ids.filter(id => inBank(id, b)));

// How many questions each choice holds (the topic list hides topics that are empty for the chosen bank).
export function bankCounts() {
  let brave = 0, all = 0;
  D.topics.forEach(t => { all += t.ids.length; });
  brave = D.brave.size;
  return { examice: all - brave, brave, both: all };
}

// After switching bank, drop picked topics / subtopics that have no questions in the new bank
// (they would be hidden from the list but still counted).
export function pruneSelection(o) {
  o.tp = (o.tp || []).filter(n => { const t = D.topics.find(x => x.name === n); return t && t.ids.some(id => inBank(id)); });
  o.sub = (o.sub || []).filter(k => { const i = k.indexOf('||'), e = subsOf(k.slice(0, i)).find(x => x.name === k.slice(i + 2)); return e && (e.q || []).some(id => inBank(id)); });
}
