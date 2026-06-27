import type { ApexLogEntry, ApexLogProfile, ProfileInsight } from '../../types';
import {
  getDescendantsBetween,
  getEntriesById,
} from '../../shared/traversal';
import {
  getFlowContext,
  isFlowRecordUpdate,
  type FlowContext,
} from '../automationContext';

type FlowRecursionCandidate = {
  context: FlowContext;
  entryId: number;
  dmlEntryIds: Set<number>;
  recursiveEntryIds: Set<number>;
  causingEntryIds: Set<number>;
};

type FlowOccurrence = {
  entry: ApexLogEntry;
  context: FlowContext;
  path: ApexLogEntry[];
};

export function findFlowRecursionInsights(
  profile: Pick<ApexLogProfile, 'entries' | 'rootIds'>
): ProfileInsight[] {
  const entriesById = getEntriesById(profile.entries);
  const candidates = new Map<string, FlowRecursionCandidate>();

  for (const entry of profile.entries) {
    if (entry.type !== 'dml') {
      continue;
    }

    inspectDmlForFlowRecursion(entry, entriesById, candidates);
  }

  return Array.from(candidates.values()).map((candidate, index) =>
    createFlowRecursionInsight(candidate, index)
  );
}

function inspectDmlForFlowRecursion(
  dmlEntry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>,
  candidates: Map<string, FlowRecursionCandidate>
) {
  const occurrences: FlowOccurrence[] = [];

  collectFlowOccurrences(dmlEntry, entriesById, [], occurrences);

  const latestByKey = new Map<string, FlowOccurrence>();

  for (const occurrence of occurrences) {
    const previous = latestByKey.get(occurrence.context.key);

    if (
      previous &&
      hasFlowRecordUpdateBetween(previous, occurrence, dmlEntry, entriesById)
    ) {
      recordFlowRecursion(dmlEntry, previous, occurrence, entriesById, candidates);
    }

    latestByKey.set(occurrence.context.key, occurrence);
  }
}

function collectFlowOccurrences(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>,
  path: ApexLogEntry[],
  occurrences: FlowOccurrence[]
) {
  const nextPath = [...path, entry];
  const flowContext = getFlowContext(entry, entriesById);

  if (flowContext) {
    occurrences.push({
      entry,
      context: flowContext,
      path: nextPath,
    });
  }

  for (const childId of entry.children) {
    const child = entriesById.get(childId);

    if (child) {
      collectFlowOccurrences(child, entriesById, nextPath, occurrences);
    }
  }
}

function recordFlowRecursion(
  dmlEntry: ApexLogEntry,
  previous: FlowOccurrence,
  recursive: FlowOccurrence,
  entriesById: Map<number, ApexLogEntry>,
  candidates: Map<string, FlowRecursionCandidate>
) {
  const key = recursive.context.key;
  const candidate =
    candidates.get(key) ??
    {
      context: previous.context,
      entryId: previous.entry.id,
      dmlEntryIds: new Set<number>(),
      recursiveEntryIds: new Set<number>(),
      causingEntryIds: new Set<number>(),
    };

  candidate.dmlEntryIds.add(dmlEntry.id);
  candidate.recursiveEntryIds.add(recursive.entry.id);
  candidate.causingEntryIds.add(dmlEntry.id);

  for (const pathEntry of getFlowRecursionPath(
    previous,
    recursive,
    dmlEntry,
    entriesById
  )) {
    candidate.causingEntryIds.add(pathEntry.id);
  }

  candidates.set(key, candidate);
}

function hasFlowRecordUpdateBetween(
  previous: FlowOccurrence,
  recursive: FlowOccurrence,
  dmlEntry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): boolean {
  return getFlowRecursionPath(previous, recursive, dmlEntry, entriesById).some(
    isFlowRecordUpdate
  );
}

function getFlowRecursionPath(
  previous: FlowOccurrence,
  recursive: FlowOccurrence,
  dmlEntry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): ApexLogEntry[] {
  const previousId = previous.entry.id;
  const recursiveId = recursive.entry.id;
  const previousPathRecordUpdates = previous.path.filter(
    (pathEntry) => pathEntry.id !== dmlEntry.id && isFlowRecordUpdate(pathEntry)
  );
  const pathEntries = recursive.path.filter(
    (pathEntry) =>
      pathEntry.id !== dmlEntry.id &&
      pathEntry.id > previousId &&
      pathEntry.id <= recursiveId
  );
  const interveningRecordUpdates = getDescendantsBetween(
    dmlEntry,
    entriesById,
    previousId,
    recursiveId
  ).filter(isFlowRecordUpdate);
  const pathById = new Map<number, ApexLogEntry>();

  for (const pathEntry of [
    ...previousPathRecordUpdates,
    ...pathEntries,
    ...interveningRecordUpdates,
  ]) {
    pathById.set(pathEntry.id, pathEntry);
  }

  return Array.from(pathById.values()).sort((left, right) => left.id - right.id);
}

function createFlowRecursionInsight(
  candidate: FlowRecursionCandidate,
  index: number
): ProfileInsight {
  const recursiveEntryIds = Array.from(candidate.recursiveEntryIds).sort(
    (left, right) => left - right
  );
  const causingEntryIds = Array.from(candidate.causingEntryIds).sort(
    (left, right) => left - right
  );
  const dmlEntryIds = Array.from(candidate.dmlEntryIds).sort(
    (left, right) => left - right
  );
  const contextLabel = candidate.context.label;

  return {
    id: `recursion-flow-${index + 1}-${candidate.entryId}`,
    kind: 'recursion',
    severity: 'serious',
    title: `Possible recursion in ${contextLabel}`,
    summary:
      `${contextLabel} starts again in the same DML operation after declarative record updates.`,
    entryIds: [candidate.entryId, ...recursiveEntryIds],
    evidence: {
      context: {
        kind: 'flow',
        flowName: candidate.context.flowName,
        object: candidate.context.object,
        label: candidate.context.label,
      },
      triggerEntryId: candidate.entryId,
      recursiveTriggerEntryIds: recursiveEntryIds,
      dmlEntryIds,
      causingEntryIds,
    },
  };
}
