import type { AppTheme } from '../types';
import { deleteStoredLogDatabase } from './indexedDbLogs';
import {
  storedLogPrefix,
  storedRawPrefix,
  themeStorageKey,
} from './storageKeys';

export type BrowserStorageEstimate = {
  usageBytes?: number;
  quotaBytes?: number;
};

export function readStoredTheme(): AppTheme {
  try {
    const storedTheme = window.localStorage.getItem(themeStorageKey);

    if (storedTheme === 'dark' || storedTheme === 'light') {
      return storedTheme;
    }

    window.localStorage.setItem(themeStorageKey, 'light');
  } catch (error) {
    console.warn('Unable to restore selected theme', error);
  }

  return 'light';
}

export function persistTheme(theme: AppTheme) {
  try {
    window.localStorage.setItem(themeStorageKey, theme);
  } catch (error) {
    console.warn('Unable to persist selected theme', error);
  }
}

export async function getBrowserStorageEstimate(): Promise<BrowserStorageEstimate> {
  try {
    const estimate = await window.navigator.storage?.estimate?.();

    if (!estimate) {
      return {};
    }

    return {
      usageBytes: estimate.usage,
      quotaBytes: estimate.quota,
    };
  } catch (error) {
    console.warn('Unable to read browser storage estimate', error);
    return {};
  }
}

export async function clearBrowserStorage() {
  try {
    const keysToRemove: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (
        key === themeStorageKey ||
        (key !== null &&
          (key.startsWith(storedLogPrefix) || key.startsWith(storedRawPrefix)))
      ) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn('Unable to clear stored browser data from localStorage', error);
  }

  try {
    await deleteStoredLogDatabase();
  } catch (error) {
    console.warn('Unable to clear stored browser data from IndexedDB', error);
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return error.name === 'QuotaExceededError' || error.code === 22;
}
