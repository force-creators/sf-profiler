import type { ApexLogEntry, ApexLogProfile } from '@sfdc-profiler/core';
import type { TimelineGroupId } from './timelineGroups';

const MIN_TIMELINE_DURATION_MS = 1;
const SUPPRESSED_TIMELINE_EVENTS = new Set(['FLOW_START_INTERVIEW_BEGIN']);
const FLOW_DML_ELEMENT_TYPES = new Set([
  'FlowRecordCreate',
  'FlowRecordDelete',
  'FlowRecordUpdate',
]);

export function getTimedEntries(profile: ApexLogProfile): ApexLogEntry[] {
  return profile.entries
    .filter(
      (entry): entry is ApexLogEntry =>
        typeof entry?.duration === 'number' &&
        (entry.duration > MIN_TIMELINE_DURATION_MS ||
          isFlowDataEntry(entry)) &&
        typeof entry.endTime === 'number' &&
        !SUPPRESSED_TIMELINE_EVENTS.has(entry.event) &&
        entry.type !== 'limit'
    )
    .sort(
      (left, right) => left.time - right.time || left.lineNumber - right.lineNumber
    );
}

export function getTimelineGroupIds(
  entry: ApexLogEntry,
  entriesById?: Map<number, ApexLogEntry>
): TimelineGroupId[] {
  const groupIds: TimelineGroupId[] = [];

  if (isFlowDmlEntry(entry)) {
    groupIds.push('dml');
  }

  if (isFlowSoqlEntry(entry)) {
    groupIds.push('soql');
  }

  if (isFlowDmlEntry(entry)) {
    groupIds.push('workflow');
  }

  if (isFlowSoqlEntry(entry)) {
    groupIds.push('workflow');
  }

  if (entriesById && isFlowSoqlExecutionEntry(entry, entriesById)) {
    groupIds.push('workflow');
  }

  if (entriesById && isApexDmlEntry(entry, entriesById)) {
    groupIds.push('apex');
  }

  if (entriesById && isApexSoqlEntry(entry, entriesById)) {
    groupIds.push('apex');
  }

  if (groupIds.length > 0) {
    if (entry.type !== 'workflow' && !groupIds.includes(entry.type)) {
      groupIds.unshift(entry.type);
    }

    return groupIds;
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

export function isFlowDmlEntry(entry: ApexLogEntry): boolean {
  return (
    isFlowElementBeginEntry(entry) &&
    (entry.metadata?.flow?.dataOperations?.includes('dml') === true ||
      FLOW_DML_ELEMENT_TYPES.has(entry.metadata?.flow?.elementType ?? ''))
  );
}

export function isFlowSoqlEntry(entry: ApexLogEntry): boolean {
  if (!isFlowElementBeginEntry(entry)) {
    return false;
  }

  if (entry.metadata?.flow?.dataOperations?.includes('soql') === true) {
    return true;
  }

  if (entry.metadata?.flow?.elementType === 'FlowRecordLookup') {
    return true;
  }

  return false;
}

export function isApexDmlEntry(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): boolean {
  return entry.type === 'dml' && hasOwningApexAncestor(entry, entriesById);
}

export function isApexSoqlEntry(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): boolean {
  return entry.type === 'soql' && hasOwningApexAncestor(entry, entriesById);
}

export function isFlowSoqlExecutionEntry(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): boolean {
  return entry.type === 'soql' && hasFlowElementAncestor(entry, entriesById);
}

function hasOwningApexAncestor(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): boolean {
  let current =
    entry.parentId === undefined ? undefined : entriesById.get(entry.parentId);

  while (current) {
    if (current.type === 'workflow') {
      return false;
    }

    if (current.type === 'apex') {
      return true;
    }

    current =
      current.parentId === undefined ? undefined : entriesById.get(current.parentId);
  }

  return false;
}

function hasFlowElementAncestor(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): boolean {
  let current =
    entry.parentId === undefined ? undefined : entriesById.get(entry.parentId);

  while (current) {
    if (
      current.event === 'FLOW_ELEMENT_BEGIN' ||
      current.event === 'FLOW_BULK_ELEMENT_BEGIN'
    ) {
      return true;
    }

    current =
      current.parentId === undefined ? undefined : entriesById.get(current.parentId);
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

function isFlowElementBeginEntry(entry: ApexLogEntry): boolean {
  return (
    entry.event === 'FLOW_ELEMENT_BEGIN' ||
    entry.event === 'FLOW_BULK_ELEMENT_BEGIN'
  );
}

function isFlowDataEntry(entry: ApexLogEntry): boolean {
  return isFlowDmlEntry(entry) || isFlowSoqlEntry(entry);
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
