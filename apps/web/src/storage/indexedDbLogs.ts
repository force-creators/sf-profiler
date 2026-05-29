import type { StoredLog } from '../types';
import {
  storedLogDbName,
  storedLogDbVersion,
  storedLogStoreName,
} from './storageKeys';

export async function persistStoredLogInIndexedDb(
  hash: string,
  storedLog: StoredLog
) {
  const database = await openStoredLogDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storedLogStoreName, 'readwrite');
    const store = transaction.objectStore(storedLogStoreName);
    const request = store.put(storedLog, hash);

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  database.close();
}

export async function readStoredLogFromIndexedDb(
  hash: string
): Promise<Partial<StoredLog> | undefined> {
  const database = await openStoredLogDatabase();

  try {
    const value = await new Promise<Partial<StoredLog> | undefined>(
      (resolve, reject) => {
        const transaction = database.transaction(storedLogStoreName, 'readonly');
        const store = transaction.objectStore(storedLogStoreName);
        const request = store.get(hash);

        request.onsuccess = () =>
          resolve(request.result as Partial<StoredLog> | undefined);
        request.onerror = () => reject(request.error);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }
    );

    return value;
  } finally {
    database.close();
  }
}

export async function deleteStoredLogFromIndexedDb(hash: string) {
  const database = await openStoredLogDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storedLogStoreName, 'readwrite');
      const store = transaction.objectStore(storedLogStoreName);
      const request = store.delete(hash);

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function deleteStoredLogDatabase() {
  if (!window.indexedDB) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const request = window.indexedDB.deleteDatabase(storedLogDbName);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB delete is blocked'));
  });
}

export async function readAllStoredLogsFromIndexedDb(): Promise<
  Array<{ hash: string; value: Partial<StoredLog> }>
> {
  const database = await openStoredLogDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storedLogStoreName, 'readonly');
      const store = transaction.objectStore(storedLogStoreName);
      const request = store.openCursor();
      const results: Array<{ hash: string; value: Partial<StoredLog> }> = [];

      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          resolve(results);
          return;
        }

        if (typeof cursor.key === 'string') {
          results.push({
            hash: cursor.key,
            value: cursor.value as Partial<StoredLog>,
          });
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function openStoredLogDatabase(): Promise<IDBDatabase> {
  if (!window.indexedDB) {
    throw new Error('IndexedDB is not available in this browser');
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(storedLogDbName, storedLogDbVersion);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(storedLogStoreName)) {
        database.createObjectStore(storedLogStoreName);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked'));
  });
}
