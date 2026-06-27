import type { ApexLogEntry } from '../types';

export function getEntriesById(
  entries: ApexLogEntry[]
): Map<number, ApexLogEntry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

export function getDescendantsBetween(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>,
  afterEntryId: number,
  beforeOrAtEntryId: number
): ApexLogEntry[] {
  const descendants: ApexLogEntry[] = [];

  for (const childId of entry.children) {
    const child = entriesById.get(childId);

    if (!child) {
      continue;
    }

    if (child.id > afterEntryId && child.id <= beforeOrAtEntryId) {
      descendants.push(child);
    }

    descendants.push(
      ...getDescendantsBetween(
        child,
        entriesById,
        afterEntryId,
        beforeOrAtEntryId
      )
    );
  }

  return descendants;
}
