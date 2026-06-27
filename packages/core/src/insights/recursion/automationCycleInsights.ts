import type { ApexLogEntry, ApexLogProfile, ProfileInsight } from '../../types';
import { getEntriesById } from '../../shared/traversal';
import {
  getAutomationContext,
  getWriteLabel,
  isAutomationWrite,
  type AutomationContext,
  type FlowContext,
} from '../automationContext';

type AutomationOccurrence = {
  entry: ApexLogEntry;
  context: AutomationContext;
  path: ApexLogEntry[];
};

type AutomationStackEntry = {
  entry: ApexLogEntry;
  context: AutomationContext;
};

type AutomationEdge = {
  source: AutomationStackEntry;
  target: AutomationOccurrence;
  writeEntry: ApexLogEntry;
  path: ApexLogEntry[];
};

type AutomationCycleCandidate = {
  context: FlowContext;
  entryId: number;
  dmlEntryIds: Set<number>;
  recursiveEntryIds: Set<number>;
  causingEntryIds: Set<number>;
  loopLabels: Set<string>;
};

export function findAutomationCycleInsights(
  profile: Pick<ApexLogProfile, 'entries' | 'rootIds'>
): ProfileInsight[] {
  const entriesById = getEntriesById(profile.entries);
  const edges: AutomationEdge[] = [];

  for (const rootId of profile.rootIds) {
    const rootEntry = entriesById.get(rootId);

    if (rootEntry) {
      collectAutomationEdges(rootEntry, entriesById, [], edges);
    }
  }

  const candidates = new Map<string, AutomationCycleCandidate>();
  const seenCycles = new Set<string>();

  for (const edge of edges) {
    if (edge.source.context.kind !== 'flow') {
      continue;
    }

    const returnPath = findEdgePath(
      edges,
      edge.target.context.key,
      edge.source.context.key
    );

    if (!returnPath) {
      continue;
    }

    const cycleEdges = [edge, ...returnPath];
    const cycleKey = getAutomationCycleKey(cycleEdges);

    if (seenCycles.has(cycleKey)) {
      continue;
    }

    seenCycles.add(cycleKey);
    recordAutomationCycle(cycleEdges, candidates);
  }

  return Array.from(candidates.values()).map((candidate, index) =>
    createAutomationCycleInsight(candidate, index)
  );
}

function collectAutomationEdges(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>,
  contextStack: AutomationStackEntry[],
  edges: AutomationEdge[]
) {
  const context = getAutomationContext(entry, entriesById);
  const nextContextStack = context
    ? [...contextStack, { entry, context }]
    : contextStack;

  if (isAutomationWrite(entry) && contextStack.length > 0) {
    const source = contextStack[contextStack.length - 1];
    const targets: AutomationOccurrence[] = [];

    collectDescendantAutomationOccurrences(entry, entriesById, [], targets);

    for (const target of targets) {
      if (target.entry.id === source.entry.id) {
        continue;
      }

      edges.push({
        source,
        target,
        writeEntry: entry,
        path: target.path,
      });
    }
  }

  for (const childId of entry.children) {
    const child = entriesById.get(childId);

    if (child) {
      collectAutomationEdges(child, entriesById, nextContextStack, edges);
    }
  }
}

function collectDescendantAutomationOccurrences(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>,
  path: ApexLogEntry[],
  occurrences: AutomationOccurrence[]
) {
  for (const childId of entry.children) {
    const child = entriesById.get(childId);

    if (!child) {
      continue;
    }

    const childPath = [...path, child];
    const context = getAutomationContext(child, entriesById);

    if (context) {
      occurrences.push({
        entry: child,
        context,
        path: childPath,
      });
    }

    collectDescendantAutomationOccurrences(
      child,
      entriesById,
      childPath,
      occurrences
    );
  }
}

function findEdgePath(
  edges: AutomationEdge[],
  fromContextKey: string,
  toContextKey: string
): AutomationEdge[] | undefined {
  const queue: Array<{ contextKey: string; path: AutomationEdge[] }> = [
    { contextKey: fromContextKey, path: [] },
  ];
  const visited = new Set<string>([fromContextKey]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    for (const edge of edges) {
      if (edge.source.context.key !== current.contextKey) {
        continue;
      }

      const nextPath = [...current.path, edge];

      if (edge.target.context.key === toContextKey) {
        return nextPath;
      }

      if (!visited.has(edge.target.context.key)) {
        visited.add(edge.target.context.key);
        queue.push({
          contextKey: edge.target.context.key,
          path: nextPath,
        });
      }
    }
  }

  return undefined;
}

function recordAutomationCycle(
  cycleEdges: AutomationEdge[],
  candidates: Map<string, AutomationCycleCandidate>
) {
  const firstEdge = cycleEdges[0];

  if (!firstEdge || firstEdge.source.context.kind !== 'flow') {
    return;
  }

  const key = firstEdge.source.context.key;
  const candidate =
    candidates.get(key) ??
    {
      context: firstEdge.source.context,
      entryId: firstEdge.source.entry.id,
      dmlEntryIds: new Set<number>(),
      recursiveEntryIds: new Set<number>(),
      causingEntryIds: new Set<number>(),
      loopLabels: new Set<string>(),
    };
  const lastEdge = cycleEdges[cycleEdges.length - 1];

  candidate.causingEntryIds.add(firstEdge.source.entry.id);

  if (lastEdge) {
    candidate.recursiveEntryIds.add(lastEdge.target.entry.id);
  }

  for (const edge of cycleEdges) {
    if (edge.writeEntry.type === 'dml') {
      candidate.dmlEntryIds.add(edge.writeEntry.id);
    }

    candidate.causingEntryIds.add(edge.source.entry.id);
    candidate.causingEntryIds.add(edge.writeEntry.id);
    candidate.causingEntryIds.add(edge.target.entry.id);

    for (const pathEntry of edge.path) {
      candidate.causingEntryIds.add(pathEntry.id);
    }
  }

  candidate.loopLabels.add(getAutomationLoopLabel(cycleEdges));
  candidates.set(key, candidate);
}

function createAutomationCycleInsight(
  candidate: AutomationCycleCandidate,
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
  const loopLabel = Array.from(candidate.loopLabels)[0];
  const contextLabel = candidate.context.label;

  return {
    id: `recursion-automation-cycle-${index + 1}-${candidate.entryId}`,
    kind: 'recursion',
    severity: 'serious',
    title: `Possible recursion in ${contextLabel}`,
    summary: loopLabel
      ? `Automation loop detected: ${loopLabel}.`
      : `${contextLabel} starts again after automation-triggered record updates.`,
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

function getAutomationCycleKey(cycleEdges: AutomationEdge[]): string {
  return cycleEdges
    .map(
      (edge) =>
        `${edge.source.context.key}:${edge.writeEntry.id}:${edge.target.context.key}:${edge.target.entry.id}`
    )
    .join('>');
}

function getAutomationLoopLabel(cycleEdges: AutomationEdge[]): string {
  const firstEdge = cycleEdges[0];

  if (!firstEdge) {
    return '';
  }

  const labels = [firstEdge.source.context.label];

  for (const edge of cycleEdges) {
    labels.push(getWriteLabel(edge.writeEntry), edge.target.context.label);
  }

  return labels.join(' -> ');
}
