import {
  defaultPerformanceInsightThresholds,
  type PerformanceInsightThresholds,
} from '@sfdc-profiler/core';
import type { AppTheme } from '../types';
import { deleteStoredLogDatabase } from './indexedDbLogs';
import {
  dismissedAnnouncementBannerStorageKey,
  performanceThresholdsStorageKey,
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

export function readStoredPerformanceThresholds(): PerformanceInsightThresholds {
  try {
    const storedThresholds = window.localStorage.getItem(
      performanceThresholdsStorageKey
    );

    if (!storedThresholds) {
      persistPerformanceThresholds(defaultPerformanceInsightThresholds);
      return defaultPerformanceInsightThresholds;
    }

    return normalizePerformanceThresholds(JSON.parse(storedThresholds));
  } catch (error) {
    console.warn('Unable to restore performance insight thresholds', error);
    return defaultPerformanceInsightThresholds;
  }
}

export function persistPerformanceThresholds(
  thresholds: PerformanceInsightThresholds
) {
  try {
    window.localStorage.setItem(
      performanceThresholdsStorageKey,
      JSON.stringify(normalizePerformanceThresholds(thresholds))
    );
  } catch (error) {
    console.warn('Unable to persist performance insight thresholds', error);
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
        key === dismissedAnnouncementBannerStorageKey ||
        key === performanceThresholdsStorageKey ||
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

function normalizePerformanceThresholds(
  value: unknown
): PerformanceInsightThresholds {
  const candidate =
    value && typeof value === 'object'
      ? (value as Partial<Record<keyof PerformanceInsightThresholds, unknown>>)
      : {};

  return {
    dml: normalizeThreshold(candidate.dml, defaultPerformanceInsightThresholds.dml),
    soql: normalizeThreshold(
      candidate.soql,
      defaultPerformanceInsightThresholds.soql
    ),
    apex: normalizeThreshold(
      candidate.apex,
      defaultPerformanceInsightThresholds.apex
    ),
    flow: normalizeThreshold(
      candidate.flow,
      defaultPerformanceInsightThresholds.flow
    ),
  };
}

function normalizeThreshold(value: unknown, fallback: number): number {
  const parsedValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return fallback;
  }

  return Math.round(parsedValue);
}
