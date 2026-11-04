// WebCrypto helpers: turn the key from Firestore into a CryptoKey, keep it
// (non-extractable) on this device so the app also opens offline, decrypt files.

const DB = 'encor-keys';
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('k');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kv(mode, fn) {
  try {
    const d = await open();
    return await new Promise(res => {
      const t = d.transaction('k', mode), s = t.objectStore('k'), q = fn(s);
      t.oncomplete = () => res(mode === 'readonly' ? (q.result === undefined ? null : q.result) : true);
      t.onerror = t.onabort = () => res(null);
    });
  } catch (e) { return null; }
}

export async function importKey(b64) {
  const raw = Uint8Array.from(atob(String(b64).trim()), c => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error('The key in Firestore is not 32 bytes.');
  // extractable:false => page scripts can use the key but cannot read it back out
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
}
export const saveKey = (uid, key) => kv('readwrite', s => s.put(key, uid));
export const loadKey = uid => kv('readonly', s => s.get(uid));
export const clearKeys = () => kv('readwrite', s => s.clear());

async function gunzip(buf) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser is too old (no DecompressionStream). Please update it.');
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// File format: 1 byte format(1) + 12 byte nonce + AES-256-GCM ciphertext (gzip-compressed JSON).
export async function decryptFile(buf, key) {
  const u = new Uint8Array(buf);
  if (u[0] !== 1) throw new Error('Unknown data format.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(1, 13) }, key, u.slice(13));
  return JSON.parse(await gunzip(plain));
}
