import type { ApexLogProfile } from '@sfdc-profiler/core';

export type LoadedLog = {
  fileName: string;
  rawText: string;
  profile: ApexLogProfile;
};

export type StoredLog = LoadedLog & {
  version: 1;
  storedAt: string;
};

export type RecentStoredLog = {
  hash: string;
  fileName: string;
  storedAt: string;
};

export type AppTheme = 'light' | 'dark';

export type LimitsSectionId = 'soql' | 'dml' | 'async' | 'system';

export type ViewId =
  | 'summary'
  | 'automation'
  | 'limits'
  | 'insights'
  | 'rawLog'
  | 'settings'
  | 'about';
