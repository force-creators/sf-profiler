import type { ApexLogEntry, ApexLogProfile, ProfileInsight } from '../../types';
import { getEntriesById } from '../../shared/traversal';
import { getTriggerContext, type TriggerContext } from '../automationContext';

type RecursionCandidate = {
  context: TriggerContext;
  triggerEntryId: number;
  dmlEntryId: number;
  recursiveTriggerEntryIds: Set<number>;
  causingEntryIds: Set<number>;
};

export function findTriggerRecursionInsights(
  profile: Pick<ApexLogProfile, 'entries' | 'rootIds'>
): ProfileInsight[] {
  const entriesById = getEntriesById(profile.entries);
  const candidates = new Map<string, RecursionCandidate>();

  for (const rootId of profile.rootIds) {
    const rootEntry = entriesById.get(rootId);

    if (!rootEntry) {
      continue;
    }

    visitEntry(rootEntry, entriesById, [], candidates);
  }

  return Array.from(candidates.values()).map((candidate, index) =>
    createTriggerRecursionInsight(candidate, index)
  );
}

function visitEntry(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>,
  triggerStack: Array<{ entry: ApexLogEntry; context: TriggerContext }>,
  candidates: Map<string, RecursionCandidate>
) {
  const triggerContext = getTriggerContext(entry);
  const nextTriggerStack = triggerContext
    ? [...triggerStack, { entry, context: triggerContext }]
    : triggerStack;

  if (entry.type === 'dml' && triggerStack.length > 0) {
    inspectDmlForRecursion(entry, entriesById, triggerStack, candidates);
  }

  for (const childId of entry.children) {
    const child = entriesById.get(childId);

    if (child) {
      visitEntry(child, entriesById, nextTriggerStack, candidates);
    }
  }
}

function inspectDmlForRecursion(
  dmlEntry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>,
  triggerStack: Array<{ entry: ApexLogEntry; context: TriggerContext }>,
  candidates: Map<string, RecursionCandidate>
) {
  const inspectedContextKeys = new Set<string>();

  for (let index = triggerStack.length - 1; index >= 0; index -= 1) {
    const activeTrigger = triggerStack[index];

    if (inspectedContextKeys.has(activeTrigger.context.key)) {
      continue;
    }

    inspectedContextKeys.add(activeTrigger.context.key);

    const recursivePaths = findDescendantTriggerPaths(
      dmlEntry,
      entriesById,
      activeTrigger.context.key
    );

    if (recursivePaths.length === 0) {
      continue;
    }

    const key = `${activeTrigger.entry.id}:${dmlEntry.id}`;
    const candidate =
      candidates.get(key) ??
      {
        context: activeTrigger.context,
        triggerEntryId: activeTrigger.entry.id,
        dmlEntryId: dmlEntry.id,
        recursiveTriggerEntryIds: new Set<number>(),
        causingEntryIds: new Set<number>([dmlEntry.id]),
      };

    for (const path of recursivePaths) {
      const recursiveTrigger = path.at(-1);

      if (!recursiveTrigger) {
        continue;
      }

      candidate.recursiveTriggerEntryIds.add(recursiveTrigger.id);

      for (const pathEntry of path) {
        candidate.causingEntryIds.add(pathEntry.id);
      }
    }

    candidates.set(key, candidate);
  }
}

function findDescendantTriggerPaths(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>,
  contextKey: string,
  path: ApexLogEntry[] = []
): ApexLogEntry[][] {
  const matches: ApexLogEntry[][] = [];

  for (const childId of entry.children) {
    const child = entriesById.get(childId);

    if (!child) {
      continue;
    }

    const childPath = [...path, child];
    const childContext = getTriggerContext(child);

    if (childContext?.key === contextKey) {
      matches.push(childPath);
    }

    matches.push(
      ...findDescendantTriggerPaths(child, entriesById, contextKey, childPath)
    );
  }

  return matches;
}

function createTriggerRecursionInsight(
  candidate: RecursionCandidate,
  index: number
): ProfileInsight {
  const recursiveTriggerEntryIds = Array.from(
    candidate.recursiveTriggerEntryIds
  ).sort((left, right) => left - right);
  const causingEntryIds = Array.from(candidate.causingEntryIds).sort(
    (left, right) => left - right
  );
  const dmlEntryIds = [candidate.dmlEntryId];
  const contextLabel = candidate.context.label;

  return {
    id: `recursion-${index + 1}-${candidate.triggerEntryId}-${candidate.dmlEntryId}`,
    kind: 'recursion',
    severity: 'serious',
    title: `Possible recursion in ${contextLabel}`,
    summary:
      `${contextLabel} starts again inside a DML operation from the same trigger context.`,
    entryIds: [
      candidate.triggerEntryId,
      candidate.dmlEntryId,
      ...recursiveTriggerEntryIds,
    ],
    evidence: {
      context: {
        kind: 'trigger',
        triggerName: candidate.context.triggerName,
        object: candidate.context.object,
        event: candidate.context.event,
        label: candidate.context.label,
      },
      triggerEntryId: candidate.triggerEntryId,
      recursiveTriggerEntryIds,
      dmlEntryIds,
      causingEntryIds,
    },
  };
}
