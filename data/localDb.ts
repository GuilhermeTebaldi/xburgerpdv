const DB_NAME = 'xburger-local-db';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });

  return dbPromise;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const waitForTransaction = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
  });

export const getItem = async <T>(key: string): Promise<T | undefined> => {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const value = await requestToPromise(store.get(key));
  await waitForTransaction(tx);
  return value as T | undefined;
};

export const getMany = async (keys: string[]): Promise<Record<string, unknown>> => {
  if (keys.length === 0) return {};
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const result: Record<string, unknown> = {};
  await Promise.all(
    keys.map(async (key) => {
      result[key] = await requestToPromise(store.get(key));
    })
  );
  await waitForTransaction(tx);
  return result;
};

export const setItem = async <T>(key: string, value: T): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(value, key);
  await waitForTransaction(tx);
};

export const setMany = async (entries: Record<string, unknown>): Promise<void> => {
  const keys = Object.keys(entries);
  if (keys.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  keys.forEach((key) => store.put(entries[key], key));
  await waitForTransaction(tx);
};

export const removeItem = async (key: string): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(key);
  await waitForTransaction(tx);
};

export const clearStore = async (): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).clear();
  await waitForTransaction(tx);
};
