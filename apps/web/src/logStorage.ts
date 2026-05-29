import { parseApexLog } from '@sfdc-profiler/core';
import { isQuotaExceededError } from './storage/browserStorage';
import { hashProfile, hashText } from './storage/hash';
import {
  deleteStoredLogFromIndexedDb,
  persistStoredLogInIndexedDb,
  readAllStoredLogsFromIndexedDb,
  readStoredLogFromIndexedDb,
} from './storage/indexedDbLogs';
import {
  clearUrlLogHash,
  getUrlLogHash,
  setUrlLogHash,
} from './storage/urlLogHash';
import {
  storedLogPrefix,
  storedLogVersion,
  storedRawPrefix,
} from './storage/storageKeys';
import type { LoadedLog, RecentStoredLog, StoredLog } from './types';

export {
  clearBrowserStorage,
  getBrowserStorageEstimate,
  persistTheme,
  readStoredTheme,
  type BrowserStorageEstimate,
} from './storage/browserStorage';

type StoredLogMatch = {
  hash: string;
  storedLog: StoredLog;
};

export async function persistLoadedLog(loadedLog: LoadedLog): Promise<string> {
  const hash = await hashProfile(loadedLog.profile);
  const storedLog: StoredLog = {
    ...loadedLog,
    version: storedLogVersion,
    storedAt: new Date().toISOString(),
  };

  await persistStoredLog(hash, storedLog);
  await persistRawTextLookup(storedLog.rawText, hash);
  setUrlLogHash(hash);

  return hash;
}

export async function findStoredLogByRawText(
  rawText: string
): Promise<StoredLogMatch | undefined> {
  const rawHash = await hashText(rawText);

  let storedHash: string | undefined;

  try {
    storedHash = window.localStorage.getItem(`${storedRawPrefix}${rawHash}`) ?? undefined;
  } catch (error) {
    console.warn('Unable to read raw log lookup index', error);
  }

  if (!storedHash) {
    return undefined;
  }

  const parsed = await readStoredLog(storedHash);
  const normalized = normalizeStoredLog(parsed);

  if (!normalized || normalized.rawText !== rawText) {
    return undefined;
  }

  return {
    hash: storedHash,
    storedLog: normalized,
  };
}

export async function reopenStoredLog(
  hash: string,
  storedLog: StoredLog,
  fileName?: string
): Promise<StoredLog> {
  const refreshedLog: StoredLog = {
    ...storedLog,
    fileName: fileName ?? storedLog.fileName,
    storedAt: new Date().toISOString(),
    version: storedLogVersion,
  };

  await persistStoredLog(hash, refreshedLog);
  await persistRawTextLookup(refreshedLog.rawText, hash);
  setUrlLogHash(hash);

  return refreshedLog;
}

export async function getRecentStoredLogs(
  limit = 10
): Promise<RecentStoredLog[]> {
  const clampedLimit = Math.max(1, limit);

  const indexedDbLogs = await readRecentStoredLogsFromIndexedDb();
  const merged = new Map<string, StoredLog>();

  for (const candidate of indexedDbLogs) {
    merged.set(candidate.hash, candidate.storedLog);
  }

  for (const candidate of readRecentStoredLogsFromLocalStorage()) {
    if (!merged.has(candidate.hash)) {
      merged.set(candidate.hash, candidate.storedLog);
    }
  }

  return Array.from(merged.entries())
    .map(([hash, storedLog]) => ({
      hash,
      fileName: storedLog.fileName,
      storedAt: storedLog.storedAt,
    }))
    .sort((left, right) =>
      right.storedAt.localeCompare(left.storedAt, undefined, { sensitivity: 'base' })
    )
    .slice(0, clampedLimit);
}

export function openStoredLogByHash(hash: string) {
  setUrlLogHash(hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function closeStoredLog() {
  clearUrlLogHash();
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export async function removeStoredLog(hash: string) {
  const storedLog = normalizeStoredLog(await readStoredLog(hash));

  try {
    await deleteStoredLogFromIndexedDb(hash);
  } catch (error) {
    console.warn('Unable to delete stored log from IndexedDB', error);
  }

  try {
    window.localStorage.removeItem(`${storedLogPrefix}${hash}`);
  } catch (error) {
    console.warn('Unable to delete stored log from localStorage', error);
  }

  if (!storedLog) {
    return;
  }

  const rawHash = await hashText(storedLog.rawText);

  try {
    window.localStorage.removeItem(`${storedRawPrefix}${rawHash}`);
  } catch (error) {
    console.warn('Unable to delete raw log lookup index', error);
  }
}

async function persistStoredLog(hash: string, storedLog: StoredLog) {
  let storedInIndexedDb = false;

  try {
    await persistStoredLogInIndexedDb(hash, storedLog);
    storedInIndexedDb = true;
  } catch (error) {
    console.warn('Unable to persist Apex log analysis in IndexedDB', error);
  }

  // IndexedDB is the primary store for parsed logs. Avoid mirroring large
  // payloads into localStorage when the primary write succeeded.
  if (storedInIndexedDb) {
    try {
      window.localStorage.removeItem(`${storedLogPrefix}${hash}`);
    } catch {
      // Best-effort cleanup only.
    }

    return;
  }

  try {
    window.localStorage.setItem(
      `${storedLogPrefix}${hash}`,
      JSON.stringify(storedLog)
    );
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      console.warn('Unable to persist Apex log analysis', error);
    }
  }
}

export async function readStoredLogFromUrl(): Promise<StoredLog | undefined> {
  const logHash = getUrlLogHash();

  if (!logHash) {
    return undefined;
  }

  try {
    const parsed = await readStoredLog(logHash);

    if (!parsed) {
      return undefined;
    }

    return normalizeStoredLog(parsed);
  } catch (error) {
    console.warn('Unable to restore Apex log analysis', error);
    return undefined;
  }
}

async function readStoredLog(hash: string): Promise<Partial<StoredLog> | undefined> {
  const indexedDbValue = await readStoredLogFromIndexedDb(hash);

  if (indexedDbValue) {
    return indexedDbValue;
  }

  const storedValue = window.localStorage.getItem(`${storedLogPrefix}${hash}`);

  if (!storedValue) {
    return undefined;
  }

  return JSON.parse(storedValue) as Partial<StoredLog>;
}

function normalizeStoredLog(parsed?: Partial<StoredLog>): StoredLog | undefined {
  if (
    !parsed ||
    parsed.version !== storedLogVersion ||
    typeof parsed.fileName !== 'string' ||
    typeof parsed.rawText !== 'string' ||
    !parsed.profile ||
    !Array.isArray(parsed.profile.entries) ||
    !Array.isArray(parsed.profile.rootIds)
  ) {
    return undefined;
  }

  return {
    fileName: parsed.fileName,
    rawText: parsed.rawText,
    profile:
      Array.isArray(parsed.profile.soqlExecutions) &&
      Array.isArray(parsed.profile.dmlExecutions)
      ? parsed.profile
      : parseApexLog(parsed.rawText, { sourceName: parsed.fileName }),
    storedAt: parsed.storedAt ?? new Date().toISOString(),
    version: storedLogVersion,
  };
}

async function readRecentStoredLogsFromIndexedDb(): Promise<StoredLogMatch[]> {
  try {
    return (await readAllStoredLogsFromIndexedDb())
      .map(({ hash, value }) => ({
        hash,
        storedLog: normalizeStoredLog(value),
      }))
      .filter(
        (
          candidate
        ): candidate is { hash: string; storedLog: StoredLog } =>
          Boolean(candidate.storedLog)
      );
  } catch (error) {
    console.warn('Unable to list stored logs from IndexedDB', error);
    return [];
  }
}

function readRecentStoredLogsFromLocalStorage(): StoredLogMatch[] {
  const results: StoredLogMatch[] = [];

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (!key || !key.startsWith(storedLogPrefix)) {
        continue;
      }

      const hash = key.slice(storedLogPrefix.length);
      const value = window.localStorage.getItem(key);

      if (!value) {
        continue;
      }

      const normalized = normalizeStoredLog(JSON.parse(value) as Partial<StoredLog>);

      if (!normalized) {
        continue;
      }

      results.push({ hash, storedLog: normalized });
    }
  } catch (error) {
    console.warn('Unable to list stored logs from localStorage', error);
  }

  return results;
}

async function persistRawTextLookup(rawText: string, hash: string) {
  const rawHash = await hashText(rawText);
  const rawLookupKey = `${storedRawPrefix}${rawHash}`;

  try {
    window.localStorage.setItem(rawLookupKey, hash);
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      console.warn('Unable to persist raw log lookup index', error);
      return;
    }

    // Clean up any legacy localStorage log payload mirrors to free quota for
    // the small raw-hash lookup entry.
    clearLocalStorageLogMirrors();

    try {
      window.localStorage.setItem(rawLookupKey, hash);
    } catch (retryError) {
      if (!isQuotaExceededError(retryError)) {
        console.warn('Unable to persist raw log lookup index', retryError);
      }
    }
  }
}

function clearLocalStorageLogMirrors() {
  try {
    const keysToRemove: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (key?.startsWith(storedLogPrefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Best-effort cleanup only.
  }
}
