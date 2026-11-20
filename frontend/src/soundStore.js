// Recorded sounds are kept in this browser (IndexedDB). Nothing is uploaded.

const DB_NAME = 'gesture-synth';
const STORE = 'sounds';
const VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req ? req.result : undefined);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function listSounds() {
  const all = await withStore('readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => b.createdAt - a.createdAt);
}

export function saveSound(sound) {
  return withStore('readwrite', (s) => s.put(sound));
}

export function deleteSound(id) {
  return withStore('readwrite', (s) => s.delete(id));
}
