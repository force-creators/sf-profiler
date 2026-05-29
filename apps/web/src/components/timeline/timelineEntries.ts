import type { ApexLogEntry, ApexLogProfile } from '@sfdc-profiler/core';

const MIN_TIMELINE_DURATION_MS = 1;

export function getTimedEntries(profile: ApexLogProfile): ApexLogEntry[] {
  return profile.entries
    .filter(
      (entry): entry is ApexLogEntry =>
        typeof entry?.duration === 'number' &&
        entry.duration > MIN_TIMELINE_DURATION_MS &&
        typeof entry.endTime === 'number' &&
        entry.type !== 'limit'
    )
    .sort(
      (left, right) => left.time - right.time || left.lineNumber - right.lineNumber
    );
}
