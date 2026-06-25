import type {
  ApexLogEntry,
  ApexLogProfile,
  DuplicateSoqlInsightEvidence,
  PerformanceInsightCategory,
  PerformanceInsightEvidence,
  PerformanceInsightThresholds,
  ProfileInsight,
  ProfileInsightEvidence,
  RecursionInsightEvidence,
  SoqlExecution,
} from './types';

type TriggerContext = RecursionInsightEvidence['context'] & {
  key: string;
};

type FlowContext = RecursionInsightEvidence['context'] & {
  key: string;
};

type RecursionCandidate = {
  context: TriggerContext;
  triggerEntryId: number;
  dmlEntryId: number;
  recursiveTriggerEntryIds: Set<number>;
  causingEntryIds: Set<number>;
};

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

type AutomationContext = TriggerContext | FlowContext;

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

const TRIGGER_CONTEXT_PATTERN =
  /^(?<triggerName>.+?) on (?<object>.+?) trigger event (?<event>.+)$/i;

export const defaultPerformanceInsightThresholds: PerformanceInsightThresholds = {
  dml: 1500,
  soql: 300,
  apex: 1000,
  flow: 1000,
};

export function findProfileInsights(
  profile: Pick<ApexLogProfile, 'entries' | 'rootIds' | 'soqlExecutions'>,
  performanceThresholds: Partial<PerformanceInsightThresholds> = {}
): ProfileInsight[] {
  const automationCycleInsights = findAutomationCycleInsights(profile);
  const automationCycleContextKeys = new Set(
    automationCycleInsights
      .map((insight) => getInsightContextKey(insight.evidence))
      .filter((key): key is string => Boolean(key))
  );

  return [
    ...findTriggerRecursionInsights(profile),
    ...automationCycleInsights,
    ...findFlowRecursionInsights(profile).filter(
      (insight) => !automationCycleContextKeys.has(getInsightContextKey(insight.evidence) ?? '')
    ),
    ...findDuplicateSoqlInsights(profile.soqlExecutions),
    ...findPerformanceInsights(profile.entries, performanceThresholds),
  ];
}

function findPerformanceInsights(
  entries: ApexLogEntry[],
  thresholds: Partial<PerformanceInsightThresholds>
): ProfileInsight[] {
  const resolvedThresholds = {
    ...defaultPerformanceInsightThresholds,
    ...thresholds,
  };

  return entries
    .map((entry) => {
      const category = getPerformanceCategory(entry);

      if (!category || typeof entry.duration !== 'number') {
        return undefined;
      }

      const threshold = resolvedThresholds[category];

      if (entry.duration < threshold) {
        return undefined;
      }

      return createPerformanceInsight(entry, category, threshold);
    })
    .filter((insight): insight is ProfileInsight => Boolean(insight))
    .sort(
      (left, right) =>
        getPerformanceDuration(right.evidence) -
          getPerformanceDuration(left.evidence) || left.entryIds[0] - right.entryIds[0]
    );
}

function createPerformanceInsight(
  entry: ApexLogEntry,
  category: PerformanceInsightCategory,
  threshold: number
): ProfileInsight {
  const label = getPerformanceEntryLabel(entry);
  const duration = Math.round(entry.duration ?? 0);
  const evidence: PerformanceInsightEvidence = {
    category,
    entryId: entry.id,
    label,
    duration,
    threshold,
    lineNumber: entry.lineNumber,
  };

  return {
    id: `performance-${category}-${entry.id}`,
    kind: 'performance',
    severity: 'warning',
    title: `Slow ${getPerformanceCategoryLabel(category)}: ${label}`,
    summary: `${label} took ${formatMilliseconds(duration)}, exceeding the ${formatMilliseconds(threshold)} ${getPerformanceCategoryLabel(category).toLowerCase()} threshold.`,
    entryIds: [entry.id],
    evidence,
  };
}

function getPerformanceCategory(
  entry: ApexLogEntry
): PerformanceInsightCategory | undefined {
  if (entry.type === 'dml') {
    return 'dml';
  }

  if (entry.type === 'soql') {
    return 'soql';
  }

  if (isFlowPerformanceEntry(entry)) {
    return 'flow';
  }

  if (entry.type === 'apex') {
    return 'apex';
  }

  return undefined;
}

function isFlowPerformanceEntry(entry: ApexLogEntry): boolean {
  return Boolean(
    entry.metadata?.flow ||
      entry.event.startsWith('FLOW_') ||
      entry.detail.startsWith('Flow:')
  );
}

function getPerformanceEntryLabel(entry: ApexLogEntry): string {
  if (entry.type === 'dml') {
    const operation = entry.metadata?.dml?.operation ?? 'DML';
    const object = entry.metadata?.dml?.object;

    return object ? `${operation} ${object}` : operation;
  }

  if (entry.type === 'soql') {
    return compactQuery(entry.metadata?.soql?.query ?? entry.detail ?? entry.event);
  }

  if (entry.metadata?.flow?.elementName) {
    return [entry.metadata.flow.elementType, entry.metadata.flow.elementName]
      .filter(Boolean)
      .join(' ');
  }

  if (entry.metadata?.flow?.flowName) {
    return entry.metadata.flow.flowName;
  }

  if (entry.metadata?.codeUnit) {
    return entry.metadata.codeUnit;
  }

  if (entry.metadata?.method) {
    return entry.metadata.method;
  }

  return entry.detail || entry.event;
}

function getPerformanceCategoryLabel(
  category: PerformanceInsightCategory
): string {
  if (category === 'dml') {
    return 'DML';
  }

  if (category === 'soql') {
    return 'SOQL';
  }

  if (category === 'apex') {
    return 'Apex';
  }

  return 'Flow';
}

function getPerformanceDuration(
  evidence: ProfileInsightEvidence | undefined
): number {
  return isPerformanceInsightEvidence(evidence) ? evidence.duration : 0;
}

function isPerformanceInsightEvidence(
  evidence: ProfileInsightEvidence | undefined
): evidence is PerformanceInsightEvidence {
  return Boolean(evidence && 'duration' in evidence && 'threshold' in evidence);
}

function formatMilliseconds(milliseconds: number): string {
  return `${milliseconds.toLocaleString('en-US')} ms`;
}

function findAutomationCycleInsights(
  profile: Pick<ApexLogProfile, 'entries' | 'rootIds'>
): ProfileInsight[] {
  const entriesById = new Map(profile.entries.map((entry) => [entry.id, entry]));
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

    const returnPath = findEdgePath(edges, edge.target.context.key, edge.source.context.key);

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

function getAutomationContext(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): AutomationContext | undefined {
  return getTriggerContext(entry) ?? getFlowContext(entry, entriesById);
}

function isAutomationWrite(entry: ApexLogEntry): boolean {
  return entry.type === 'dml' || isFlowRecordUpdateBulkEntry(entry);
}

function isFlowRecordUpdateBulkEntry(entry: ApexLogEntry): boolean {
  return (
    entry.event === 'FLOW_BULK_ELEMENT_BEGIN' &&
    entry.metadata?.flow?.elementType === 'FlowRecordUpdate'
  );
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

function getWriteLabel(entry: ApexLogEntry): string {
  if (entry.type === 'dml') {
    const operation = entry.metadata?.dml?.operation ?? 'DML';
    const object = entry.metadata?.dml?.object;

    return object ? `${operation} ${object}` : operation;
  }

  if (entry.metadata?.flow?.elementName) {
    return entry.metadata.flow.elementName;
  }

  return entry.detail || entry.event;
}

function getInsightContextKey(
  evidence: ProfileInsightEvidence | undefined
): string | undefined {
  if (!isRecursionInsightEvidence(evidence)) {
    return undefined;
  }

  if (evidence.context.kind === 'flow') {
    const normalizedFlowName = normalizeValue(evidence.context.flowName);
    const normalizedObject = normalizeValue(evidence.context.object);

    return normalizedFlowName
      ? `flow:${normalizedFlowName}`
      : normalizedObject
        ? `flow-object:${normalizedObject}`
        : undefined;
  }

  if (evidence.context.kind === 'trigger') {
    return [normalizeValue(evidence.context.object), normalizeValue(evidence.context.event)]
      .filter(Boolean)
      .join(':');
  }

  return normalizeValue(evidence.context.label);
}

function findDuplicateSoqlInsights(
  soqlExecutions: SoqlExecution[]
): ProfileInsight[] {
  const executionsByQuery = new Map<string, SoqlExecution[]>();

  for (const execution of soqlExecutions) {
    const existing = executionsByQuery.get(execution.normalizedQuery) ?? [];
    existing.push(execution);
    executionsByQuery.set(execution.normalizedQuery, existing);
  }

  return Array.from(executionsByQuery.values())
    .filter((executions) => executions.length > 1)
    .sort((left, right) => right.length - left.length || left[0].id - right[0].id)
    .map((executions, index) => createDuplicateSoqlInsight(executions, index));
}

function createDuplicateSoqlInsight(
  executions: SoqlExecution[],
  index: number
): ProfileInsight {
  const firstExecution = executions[0];
  const totalDuration = sumDefinedNumbers(
    executions.map((execution) => execution.duration)
  );
  const totalRows = sumDefinedNumbers(executions.map((execution) => execution.rows));
  const evidence: DuplicateSoqlInsightEvidence = {
    query: firstExecution.query,
    normalizedQuery: firstExecution.normalizedQuery,
    executionIds: executions.map((execution) => execution.id),
    executionEntryIds: executions.map((execution) => execution.entryId),
    count: executions.length,
    totalDuration,
    totalRows,
  };

  return {
    id: `duplicate-soql-${index + 1}-${firstExecution.id}`,
    kind: 'duplicate-soql',
    severity: 'warning',
    title: `SOQL query ran ${executions.length} times`,
    summary: `${compactQuery(firstExecution.query)} ran ${executions.length} times in this transaction.`,
    entryIds: evidence.executionEntryIds,
    evidence,
  };
}

function isRecursionInsightEvidence(
  evidence: ProfileInsightEvidence | undefined
): evidence is RecursionInsightEvidence {
  return Boolean(evidence && 'context' in evidence);
}

function sumDefinedNumbers(values: Array<number | undefined>): number | undefined {
  const definedValues = values.filter(
    (value): value is number => typeof value === 'number'
  );

  if (definedValues.length === 0) {
    return undefined;
  }

  return definedValues.reduce((total, value) => total + value, 0);
}

function compactQuery(query: string): string {
  const compacted = query.replace(/\s+/g, ' ').trim();

  if (compacted.length <= 110) {
    return compacted;
  }

  return `${compacted.slice(0, 109)}...`;
}

function findTriggerRecursionInsights(
  profile: Pick<ApexLogProfile, 'entries' | 'rootIds'>
): ProfileInsight[] {
  const entriesById = new Map(profile.entries.map((entry) => [entry.id, entry]));
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

function findFlowRecursionInsights(
  profile: Pick<ApexLogProfile, 'entries' | 'rootIds'>
): ProfileInsight[] {
  const entriesById = new Map(profile.entries.map((entry) => [entry.id, entry]));
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

function getDescendantsBetween(
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
      ...getDescendantsBetween(child, entriesById, afterEntryId, beforeOrAtEntryId)
    );
  }

  return descendants;
}

function isFlowRecordUpdate(entry: ApexLogEntry): boolean {
  return entry.metadata?.flow?.elementType === 'FlowRecordUpdate';
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

function getTriggerContext(entry: ApexLogEntry): TriggerContext | undefined {
  if (entry.event !== 'CODE_UNIT_STARTED' || !entry.metadata?.trigger) {
    return undefined;
  }

  const rawContext = entry.metadata.trigger;
  const match = rawContext.match(TRIGGER_CONTEXT_PATTERN);
  const triggerName = match?.groups?.triggerName?.trim();
  const object = match?.groups?.object?.trim();
  const event = match?.groups?.event?.trim();
  const label =
    object && event
      ? `${object} ${formatTriggerEvent(event)}`
      : rawContext.trim();
  const key = [normalizeValue(object), normalizeValue(event)]
    .filter(Boolean)
    .join(':');

  if (!key) {
    return undefined;
  }

  return {
    kind: 'trigger',
    triggerName,
    object,
    event,
    label,
    key,
  };
}

function getFlowContext(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): FlowContext | undefined {
  if (entry.event === 'CODE_UNIT_STARTED' && entry.metadata?.flow?.object) {
    const object = entry.metadata.flow.object;
    const flowName = findFirstDescendantFlowName(entry, entriesById);
    const label = flowName ?? `${object} flow context`;
    const normalizedFlowName = normalizeValue(flowName);
    const normalizedObject = normalizeValue(object);
    const key = normalizedFlowName
      ? `flow:${normalizedFlowName}`
      : normalizedObject
        ? `flow-object:${normalizedObject}`
        : undefined;

    if (!key) {
      return undefined;
    }

    return {
      kind: 'flow',
      flowName,
      object,
      label,
      key,
    };
  }

  if (entry.event !== 'FLOW_CREATE_INTERVIEW_END') {
    return undefined;
  }

  if (hasFlowCodeUnitAncestor(entry, entriesById)) {
    return undefined;
  }

  const flowName = entry.metadata?.flow?.flowName ?? entry.detail;
  const object = findNearestFlowObject(entry, entriesById);
  const label = flowName || (object ? `${object} flow` : 'Flow interview');
  const normalizedFlowName = normalizeValue(flowName);
  const normalizedObject = normalizeValue(object);
  const key = normalizedFlowName
    ? `flow:${normalizedFlowName}`
    : normalizedObject
      ? `flow-object:${normalizedObject}`
      : undefined;

  if (!key) {
    return undefined;
  }

  return {
    kind: 'flow',
    flowName,
    object,
    label,
    key,
  };
}

function findFirstDescendantFlowName(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): string | undefined {
  for (const childId of entry.children) {
    const child = entriesById.get(childId);

    if (!child) {
      continue;
    }

    if (child.event === 'FLOW_CREATE_INTERVIEW_END') {
      return child.metadata?.flow?.flowName ?? child.detail;
    }

    const flowName = findFirstDescendantFlowName(child, entriesById);

    if (flowName) {
      return flowName;
    }
  }

  return undefined;
}

function hasFlowCodeUnitAncestor(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): boolean {
  let current =
    entry.parentId === undefined ? undefined : entriesById.get(entry.parentId);

  while (current) {
    if (current.event === 'CODE_UNIT_STARTED' && current.metadata?.flow?.object) {
      return true;
    }

    current =
      current.parentId === undefined ? undefined : entriesById.get(current.parentId);
  }

  return false;
}

function findNearestFlowObject(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): string | undefined {
  let current: ApexLogEntry | undefined = entry;

  while (current) {
    const object = current.metadata?.flow?.object;

    if (object) {
      return object;
    }

    current =
      current.parentId === undefined ? undefined : entriesById.get(current.parentId);
  }

  return undefined;
}

function normalizeValue(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase();
}

function formatTriggerEvent(event: string): string {
  return event.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}
