// ═══════════════════════════════════════════
// IndexedDB — Almacenamiento local offline
// ═══════════════════════════════════════════
const DB_NAME = 'fotoperiodo_db';
const DB_VER = 1;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('camas'))
        d.createObjectStore('camas', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('lecturas'))
        d.createObjectStore('lecturas', { keyPath: 'id', autoIncrement: true })
          .createIndex('bloque_fecha', ['bloque', 'fecha']);
      if (!d.objectStoreNames.contains('radiometria'))
        d.createObjectStore('radiometria', { keyPath: 'id', autoIncrement: true })
          .createIndex('bloque_fecha', ['bloque', 'fecha']);
      if (!d.objectStoreNames.contains('gps_puntos'))
        d.createObjectStore('gps_puntos', { keyPath: 'id', autoIncrement: true })
          .createIndex('fecha', 'fecha');
      if (!d.objectStoreNames.contains('config'))
        d.createObjectStore('config', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('sync_queue'))
        d.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e);
  });
}

async function dbPut(store, data) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).put(data);
    tx.oncomplete = () => res(true);
    tx.onerror = e => rej(e);
  });
}

async function dbAdd(store, data) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readwrite');
    const req = tx.objectStore(store).add(data);
    req.onsuccess = () => res(req.result);
    tx.onerror = e => rej(e);
  });
}

async function dbGet(store, key) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = e => rej(e);
  });
}

async function dbGetAll(store) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = e => rej(e);
  });
}

async function dbDelete(store, key) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => res(true);
    tx.onerror = e => rej(e);
  });
}

async function dbClear(store) {
  const d = await openDB();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => res(true);
    tx.onerror = e => rej(e);
  });
}

// Cola de sincronización
async function addToSyncQueue(type, data) {
  await dbAdd('sync_queue', {
    type,
    data,
    timestamp: Date.now(),
    synced: false
  });
}

async function getSyncQueue() {
  return await dbGetAll('sync_queue');
}

async function clearSyncQueue() {
  return await dbClear('sync_queue');
}

// Config helpers
async function getConfig(key) {
  const r = await dbGet('config', key);
  return r ? r.value : null;
}

async function setConfig(key, value) {
  return await dbPut('config', { key, value });
}
