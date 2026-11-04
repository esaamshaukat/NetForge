// exam mode: thin wrapper around the shared test engine in test.js
import * as T from './test.js';
const M = 'exam';
export const render = () => T.render(M);
export const handle = (a, b) => T.handle(M, a, b);
export const input = (id, el) => T.input(M, id, el);
export const change = (id, el) => T.change(M, id, el);
export const key = e => T.key(M, e);
