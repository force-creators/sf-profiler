import type { ApexLogEntry, ApexLogProfile } from '@sfdc-profiler/core';
import type { TimelineGroupId } from './timelineGroups';

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

export function getTimelineGroupId(entry: ApexLogEntry): TimelineGroupId {
  return entry.type;
}

export function getTimelineGroupIds(entry: ApexLogEntry): TimelineGroupId[] {
  if (isFlowRecordUpdateBulkEntry(entry)) {
    return [entry.type, 'dml'];
  }

  return [entry.type];
}

export type TimelineFlowRole = {
  depth: number;
  isInvoked: boolean;
  kind: 'context' | 'element';
};

export function getTimelineFlowRole(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): TimelineFlowRole | undefined {
  if (entry.type !== 'workflow') {
    return undefined;
  }

  const kind = getFlowRoleKind(entry);

  if (!kind) {
    return undefined;
  }

  const enclosingFlowCodeUnits = countEnclosingFlowCodeUnits(entry, entriesById);
  const selfFlowCodeUnit = isFlowCodeUnitEntry(entry) ? 1 : 0;
  const flowCodeUnitDepth = Math.max(enclosingFlowCodeUnits + selfFlowCodeUnit - 1, 0);

  return {
    depth: flowCodeUnitDepth,
    isInvoked: flowCodeUnitDepth > 0,
    kind,
  };
}

export function isFlowContextEntry(entry: ApexLogEntry): boolean {
  return isFlowCodeUnitEntry(entry) || entry.event === 'FLOW_CREATE_INTERVIEW_END';
}

export function isFlowRecordUpdateBulkEntry(entry: ApexLogEntry): boolean {
  if (
    entry.event === 'FLOW_BULK_ELEMENT_BEGIN' &&
    entry.metadata?.flow?.elementType === 'FlowRecordUpdate'
  ) {
    return true;
  }

  return false;
}

function getFlowRoleKind(entry: ApexLogEntry): TimelineFlowRole['kind'] | undefined {
  if (isFlowContextEntry(entry)) {
    return 'context';
  }

  if (
    entry.event === 'FLOW_ELEMENT_BEGIN' ||
    entry.event === 'FLOW_BULK_ELEMENT_BEGIN'
  ) {
    return 'element';
  }

  return undefined;
}

function countEnclosingFlowCodeUnits(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): number {
  let count = 0;
  let current =
    entry.parentId === undefined ? undefined : entriesById.get(entry.parentId);

  while (current) {
    if (isFlowCodeUnitEntry(current)) {
      count += 1;
    }

    current =
      current.parentId === undefined ? undefined : entriesById.get(current.parentId);
  }

  return count;
}

function isFlowCodeUnitEntry(entry: ApexLogEntry): boolean {
  return entry.event === 'CODE_UNIT_STARTED' && Boolean(entry.metadata?.flow?.object);
}
