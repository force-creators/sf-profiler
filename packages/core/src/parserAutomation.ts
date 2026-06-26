import type {
  ApexLogEntry,
  ApexLogProfile,
  AutomationElement,
  AutomationExecution,
  AutomationFlag,
  AutomationFlagKind,
  AutomationKind,
  AutomationMetric,
  AutomationMetrics,
  AutomationProfile,
  AutomationUnit,
  DmlExecution,
  ProfileInsight,
  ProfileInsightEvidence,
  RecursionInsightEvidence,
  SoqlExecution,
} from './types';

type AutomationDraftMetrics = {
  durationMs?: AutomationMetric;
  cpuMs?: AutomationMetric;
  soqlQueries?: AutomationMetric;
  soqlRows?: AutomationMetric;
  dmlStatements?: AutomationMetric;
  dmlRows?: AutomationMetric;
};

type AutomationUnitDraft = Omit<
  AutomationUnit,
  'entryIds' | 'executionIds' | 'elementIds' | 'flags' | 'insightIds'
> & {
  entryIds: Set<number>;
  executionIds: Set<string>;
  elementIds: Set<string>;
  flags: Map<AutomationFlagKind, AutomationFlag>;
  insightIds: Set<string>;
  metrics: AutomationDraftMetrics;
};

type AutomationExecutionDraft = Omit<
  AutomationExecution,
  | 'entryIds'
  | 'elementIds'
  | 'soqlExecutionIds'
  | 'dmlExecutionIds'
  | 'flags'
  | 'insightIds'
> & {
  entryIds: Set<number>;
  elementIds: Set<string>;
  soqlExecutionIds: Set<number>;
  dmlExecutionIds: Set<number>;
  flags: Map<AutomationFlagKind, AutomationFlag>;
  insightIds: Set<string>;
  metrics: AutomationDraftMetrics;
  startTime?: number;
  startSnapshot?: UsageSnapshot;
  finishSnapshot?: UsageSnapshot;
};

type AutomationElementDraft = Omit<
  AutomationElement,
  'entryIds' | 'executionIds'
> & {
  entryIds: Set<number>;
  executionIds: Set<string>;
  metrics: AutomationDraftMetrics;
};

type FlowCodeUnitContext = {
  kind: 'flow-context';
  startEntryId?: number;
  object?: string;
  latestInterviewId?: string;
  currentInterviewId?: string;
  finishedInterviewId?: string;
  currentElementId?: string;
};

type ExecutionCodeUnitContext = {
  kind: 'execution';
  detail: string;
  executionId: string;
};

type CodeUnitContext = FlowCodeUnitContext | ExecutionCodeUnitContext;

type UsageSnapshot = Partial<
  Record<'cpuMs' | 'soqlQueries' | 'soqlRows' | 'dmlStatements' | 'dmlRows', number>
>;

const TRIGGER_CONTEXT_PATTERN =
  /^(?<triggerName>.+?) on (?<object>.+?) trigger event (?<event>.+)$/i;

export class AutomationCollector {
  private units = new Map<string, AutomationUnitDraft>();
  private executions = new Map<string, AutomationExecutionDraft>();
  private elements = new Map<string, AutomationElementDraft>();
  private codeUnitStack: CodeUnitContext[] = [];
  private flowInterviews = new Map<
    string,
    { executionId: string; flowName: string; object?: string }
  >();
  private entryExecutionIds = new Map<number, string>();
  private entryUnitIds = new Map<number, string>();

  recordEntry(entry: ApexLogEntry) {
    if (entry.event === 'CODE_UNIT_STARTED') {
      this.recordCodeUnitStarted(entry);
      return;
    }

    if (entry.event === 'CODE_UNIT_FINISHED') {
      this.recordCodeUnitFinished(entry);
      return;
    }

    if (entry.event === 'FLOW_CREATE_INTERVIEW_END') {
      this.recordFlowInterviewCreated(entry);
      return;
    }

    if (entry.event === 'FLOW_START_INTERVIEW_BEGIN') {
      this.recordFlowInterviewStarted(entry);
      return;
    }

    if (entry.event === 'FLOW_START_INTERVIEW_LIMIT_USAGE') {
      this.recordFlowInterviewUsage(entry, 'start');
      return;
    }

    if (entry.event === 'FLOW_START_INTERVIEW_END') {
      this.recordFlowInterviewStartFinished(entry);
      return;
    }

    if (entry.event === 'FLOW_INTERVIEW_FINISHED') {
      this.recordFlowInterviewFinished(entry);
      return;
    }

    if (entry.event === 'FLOW_INTERVIEW_FINISHED_LIMIT_USAGE') {
      this.recordFlowInterviewUsage(entry, 'finish');
      return;
    }

    if (
      entry.event === 'FLOW_ELEMENT_BEGIN' ||
      entry.event === 'FLOW_BULK_ELEMENT_BEGIN'
    ) {
      this.recordFlowElementStarted(entry);
      return;
    }

    if (
      entry.event === 'FLOW_ELEMENT_LIMIT_USAGE' ||
      entry.event === 'FLOW_BULK_ELEMENT_LIMIT_USAGE'
    ) {
      this.recordFlowElementUsage(entry);
      return;
    }

    if (
      entry.event === 'FLOW_ELEMENT_END' ||
      entry.event === 'FLOW_BULK_ELEMENT_END'
    ) {
      this.recordFlowElementFinished(entry);
      return;
    }

    const executionId = this.getNearestExecutionId();

    if (executionId) {
      this.linkEntryToExecution(entry.id, executionId);
    }
  }

  recordSoqlExecution(execution: SoqlExecution) {
    const executionId = this.entryExecutionIds.get(execution.entryId);

    if (!executionId) {
      return;
    }

    const automationExecution = this.executions.get(executionId);

    if (!automationExecution) {
      return;
    }

    automationExecution.soqlExecutionIds.add(execution.id);
    addMetric(automationExecution.metrics, 'soqlQueries', 1, 'inferred');

    if (typeof execution.rows === 'number') {
      addMetric(
        automationExecution.metrics,
        'soqlRows',
        execution.rows,
        'inferred'
      );
    }
  }

  recordDmlExecution(execution: DmlExecution) {
    const executionId = this.entryExecutionIds.get(execution.entryId);

    if (!executionId) {
      return;
    }

    const automationExecution = this.executions.get(executionId);

    if (!automationExecution) {
      return;
    }

    automationExecution.dmlExecutionIds.add(execution.id);
    addMetric(automationExecution.metrics, 'dmlStatements', 1, 'inferred');

    if (typeof execution.rows === 'number') {
      addMetric(
        automationExecution.metrics,
        'dmlRows',
        execution.rows,
        'inferred'
      );
    }
  }

  finalize(): AutomationProfile {
    for (const execution of this.executions.values()) {
      this.applyFlowSnapshotDeltas(execution);
    }

    for (const unit of this.units.values()) {
      unit.metrics = {};
    }

    for (const execution of this.executions.values()) {
      const unit = this.units.get(execution.unitId);

      if (!unit) {
        continue;
      }

      unit.executionIds.add(execution.id);
      mergeMetrics(unit.metrics, execution.metrics);

      for (const entryId of execution.entryIds) {
        unit.entryIds.add(entryId);
      }

      for (const elementId of execution.elementIds) {
        unit.elementIds.add(elementId);
      }
    }

    return {
      units: Array.from(this.units.values())
        .map(finalizeUnit)
        .sort(compareAutomationUnits),
      executions: Array.from(this.executions.values())
        .map(finalizeExecution)
        .sort((left, right) => (left.startLineNumber ?? 0) - (right.startLineNumber ?? 0)),
      elements: Array.from(this.elements.values())
        .map(finalizeElement)
        .sort(compareAutomationElements),
    };
  }

  linkInsights(insights: ProfileInsight[]) {
    for (const insight of insights) {
      const executionIds = new Set<string>();
      const unitIds = new Set<string>();

      for (const entryId of insight.entryIds) {
        const executionId = this.entryExecutionIds.get(entryId);
        const unitId = this.entryUnitIds.get(entryId);

        if (executionId) {
          executionIds.add(executionId);
          const execution = this.executions.get(executionId);

          if (execution) {
            unitIds.add(execution.unitId);
          }
        }

        if (unitId) {
          unitIds.add(unitId);
        }
      }

      const evidenceEntryIds = getEvidenceEntryIds(insight.evidence);

      for (const entryId of evidenceEntryIds) {
        const executionId = this.entryExecutionIds.get(entryId);
        const unitId = this.entryUnitIds.get(entryId);

        if (executionId) {
          executionIds.add(executionId);
          const execution = this.executions.get(executionId);

          if (execution) {
            unitIds.add(execution.unitId);
          }
        }

        if (unitId) {
          unitIds.add(unitId);
        }
      }

      if (unitIds.size > 0) {
        insight.automationUnitIds = Array.from(unitIds).sort();
      }

      if (executionIds.size > 0) {
        insight.automationExecutionIds = Array.from(executionIds).sort();
      }

      const flag = getFlagForInsight(insight);

      if (!flag) {
        continue;
      }

      for (const executionId of executionIds) {
        const execution = this.executions.get(executionId);

        if (execution) {
          execution.flags.set(flag.kind, flag);
          execution.insightIds.add(insight.id);
        }
      }

      for (const unitId of unitIds) {
        const unit = this.units.get(unitId);

        if (unit) {
          unit.flags.set(flag.kind, flag);
          unit.insightIds.add(insight.id);
        }
      }
    }
  }

  private recordCodeUnitStarted(entry: ApexLogEntry) {
    const detail = entry.detail;

    if (detail.startsWith('Flow:')) {
      this.codeUnitStack.push({
        kind: 'flow-context',
        startEntryId: entry.id,
        object: detail.slice('Flow:'.length) || undefined,
      });
      return;
    }

    const triggerContext = getTriggerContext(entry);
    const codeUnitKind = getCodeUnitKind(detail);

    if (!triggerContext && codeUnitKind === undefined) {
      return;
    }

    const kind: AutomationKind = triggerContext ? 'trigger' : (codeUnitKind ?? 'other');
    const name = triggerContext?.triggerName ?? getCodeUnitName(detail);
    const unitId = triggerContext
      ? getTriggerUnitId(triggerContext)
      : getGenericUnitId(kind, name);
    const executionId = `${unitId}:${entry.id}`;
    const unit = this.ensureUnit({
      id: unitId,
      kind,
      name,
      object: triggerContext?.object,
      event: triggerContext?.event,
      codeUnit: detail,
    });
    const execution = this.ensureExecution({
      id: executionId,
      unitId,
      kind,
      name,
      object: triggerContext?.object,
      event: triggerContext?.event,
      startEntryId: entry.id,
      startLineNumber: entry.lineNumber,
      startTime: entry.time,
    });

    unit.entryIds.add(entry.id);
    execution.entryIds.add(entry.id);
    this.entryExecutionIds.set(entry.id, executionId);
    this.entryUnitIds.set(entry.id, unitId);
    this.codeUnitStack.push({ kind: 'execution', detail, executionId });
  }

  private recordCodeUnitFinished(entry: ApexLogEntry) {
    const topContext = this.codeUnitStack[this.codeUnitStack.length - 1];

    if (!topContext) {
      return;
    }

    if (topContext.kind === 'flow-context') {
      if (!entry.detail.startsWith('Flow:')) {
        return;
      }

      this.codeUnitStack.pop();
      return;
    }

    if (topContext.detail !== entry.detail) {
      return;
    }

    this.codeUnitStack.pop();
    const execution = this.executions.get(topContext.executionId);

    if (!execution) {
      return;
    }

    execution.endEntryId = entry.id;
    execution.endLineNumber = entry.lineNumber;
    execution.entryIds.add(entry.id);
    this.entryExecutionIds.set(entry.id, execution.id);
    this.entryUnitIds.set(entry.id, execution.unitId);

    if (typeof execution.startTime === 'number') {
      setMetric(
        execution.metrics,
        'durationMs',
        Math.max(0, entry.time - execution.startTime),
        'duration'
      );
    }
  }

  private recordFlowInterviewCreated(entry: ApexLogEntry) {
    const interviewId = entry.metadata?.flow?.interviewId;
    const flowName = entry.metadata?.flow?.flowName ?? entry.detail;

    if (!interviewId || !flowName) {
      return;
    }

    const context = this.getCurrentFlowContext();
    const object = context?.object;
    const unitId = getFlowUnitId(flowName);
    const executionId = getFlowExecutionId(interviewId);
    const unit = this.ensureUnit({
      id: unitId,
      kind: 'flow',
      name: flowName,
      object,
      codeUnit: object ? `Flow:${object}` : undefined,
    });
    const execution = this.ensureExecution({
      id: executionId,
      unitId,
      kind: 'flow',
      name: flowName,
      object,
      startEntryId: entry.id,
      startLineNumber: entry.lineNumber,
      startTime: entry.time,
    });

    unit.entryIds.add(entry.id);
    execution.entryIds.add(entry.id);
    this.flowInterviews.set(interviewId, { executionId, flowName, object });
    this.entryExecutionIds.set(entry.id, executionId);
    this.entryUnitIds.set(entry.id, unitId);

    if (context) {
      context.latestInterviewId = interviewId;

      if (context.startEntryId !== undefined) {
        this.linkEntryToExecution(context.startEntryId, executionId);
      }
    }
  }

  private recordFlowInterviewStarted(entry: ApexLogEntry) {
    const interviewId = entry.metadata?.flow?.interviewId;

    if (!interviewId) {
      return;
    }

    this.ensureFlowExecutionFromEntry(entry, interviewId);
    const context = this.getCurrentFlowContext();

    if (context) {
      context.currentInterviewId = interviewId;
      context.latestInterviewId = interviewId;
      context.finishedInterviewId = undefined;
    }

    this.linkFlowEntry(entry, interviewId);
  }

  private recordFlowInterviewUsage(
    entry: ApexLogEntry,
    snapshotKind: 'start' | 'finish'
  ) {
    const usage = parseFlowSnapshot(entry.detail);

    if (!usage) {
      return;
    }

    const interviewId =
      snapshotKind === 'start'
        ? this.getCurrentFlowContext()?.currentInterviewId
        : this.getCurrentFlowContext()?.finishedInterviewId;

    if (!interviewId) {
      return;
    }

    const execution = this.getFlowExecution(interviewId);

    if (!execution) {
      return;
    }

    const snapshot =
      snapshotKind === 'start'
        ? (execution.startSnapshot ??= {})
        : (execution.finishSnapshot ??= {});

    snapshot[usage.metric] = usage.current;
  }

  private recordFlowInterviewStartFinished(entry: ApexLogEntry) {
    const interviewId = entry.metadata?.flow?.interviewId;

    if (!interviewId) {
      return;
    }

    this.linkFlowEntry(entry, interviewId);
    const context = this.getCurrentFlowContext();

    if (context?.currentInterviewId === interviewId) {
      context.currentInterviewId = undefined;
    }
  }

  private recordFlowInterviewFinished(entry: ApexLogEntry) {
    const interviewId = entry.metadata?.flow?.interviewId;

    if (!interviewId) {
      return;
    }

    this.linkFlowEntry(entry, interviewId);
    const execution = this.getFlowExecution(interviewId);

    if (execution) {
      execution.endEntryId = entry.id;
      execution.endLineNumber = entry.lineNumber;

      if (typeof execution.startTime === 'number') {
        setMetric(
          execution.metrics,
          'durationMs',
          Math.max(0, entry.time - execution.startTime),
          'duration'
        );
      }
    }

    const context = this.getCurrentFlowContext();

    if (context) {
      context.finishedInterviewId = interviewId;
      context.latestInterviewId = interviewId;
      context.currentInterviewId = undefined;
    }
  }

  private recordFlowElementStarted(entry: ApexLogEntry) {
    const interviewId =
      entry.metadata?.flow?.interviewId ?? this.getCurrentFlowContext()?.latestInterviewId;

    if (!interviewId) {
      return;
    }

    const execution = this.getFlowExecution(interviewId);

    if (!execution) {
      return;
    }

    const elementType = entry.metadata?.flow?.elementType;
    const elementName = entry.metadata?.flow?.elementName ?? entry.detail;
    const element = this.ensureElement(
      execution.unitId,
      elementName,
      elementType
    );

    element.entryIds.add(entry.id);
    element.executionIds.add(execution.id);
    execution.elementIds.add(element.id);
    this.linkFlowEntry(entry, interviewId);

    const context = this.getCurrentFlowContext();

    if (context) {
      context.currentElementId = element.id;
    }
  }

  private recordFlowElementUsage(entry: ApexLogEntry) {
    const usage = parseFlowDelta(entry.detail);

    if (!usage) {
      return;
    }

    const context = this.getCurrentFlowContext();
    const element = context?.currentElementId
      ? this.elements.get(context.currentElementId)
      : undefined;

    if (!element) {
      return;
    }

    addMetric(element.metrics, usage.metric, usage.delta, 'exact');
  }

  private recordFlowElementFinished(entry: ApexLogEntry) {
    const context = this.getCurrentFlowContext();
    const interviewId =
      entry.metadata?.flow?.interviewId ?? context?.latestInterviewId;

    if (interviewId) {
      this.linkFlowEntry(entry, interviewId);
    }

    if (context?.currentElementId) {
      const element = this.elements.get(context.currentElementId);

      if (element) {
        element.entryIds.add(entry.id);
      }

      context.currentElementId = undefined;
    }
  }

  private getCurrentFlowContext(): FlowCodeUnitContext | undefined {
    for (let index = this.codeUnitStack.length - 1; index >= 0; index -= 1) {
      const context = this.codeUnitStack[index];

      if (context.kind === 'flow-context') {
        return context;
      }
    }

    return undefined;
  }

  private getNearestExecutionId(): string | undefined {
    for (let index = this.codeUnitStack.length - 1; index >= 0; index -= 1) {
      const context = this.codeUnitStack[index];

      if (context.kind === 'execution') {
        return context.executionId;
      }

      if (context.kind === 'flow-context' && context.latestInterviewId) {
        return this.flowInterviews.get(context.latestInterviewId)?.executionId;
      }
    }

    return undefined;
  }

  private ensureFlowExecutionFromEntry(entry: ApexLogEntry, interviewId: string) {
    const existing = this.flowInterviews.get(interviewId);

    if (existing) {
      return;
    }

    const flowName = entry.metadata?.flow?.flowName ?? entry.detail;
    const object = this.getCurrentFlowContext()?.object;
    const unitId = getFlowUnitId(flowName);
    const executionId = getFlowExecutionId(interviewId);

    this.ensureUnit({
      id: unitId,
      kind: 'flow',
      name: flowName,
      object,
      codeUnit: object ? `Flow:${object}` : undefined,
    });
    this.ensureExecution({
      id: executionId,
      unitId,
      kind: 'flow',
      name: flowName,
      object,
      startEntryId: entry.id,
      startLineNumber: entry.lineNumber,
      startTime: entry.time,
    });
    this.flowInterviews.set(interviewId, { executionId, flowName, object });
  }

  private getFlowExecution(
    interviewId: string
  ): AutomationExecutionDraft | undefined {
    const flowInterview = this.flowInterviews.get(interviewId);

    return flowInterview
      ? this.executions.get(flowInterview.executionId)
      : undefined;
  }

  private linkFlowEntry(entry: ApexLogEntry, interviewId: string) {
    const execution = this.getFlowExecution(interviewId);

    if (!execution) {
      return;
    }

    this.linkEntryToExecution(entry.id, execution.id);
  }

  private linkEntryToExecution(entryId: number, executionId: string) {
    const execution = this.executions.get(executionId);

    if (!execution) {
      return;
    }

    execution.entryIds.add(entryId);
    this.entryExecutionIds.set(entryId, execution.id);
    this.entryUnitIds.set(entryId, execution.unitId);

    const unit = this.units.get(execution.unitId);

    if (unit) {
      unit.entryIds.add(entryId);
    }
  }

  private ensureUnit(
    unit: Omit<AutomationUnit, 'entryIds' | 'executionIds' | 'elementIds' | 'metrics' | 'flags' | 'insightIds'>
  ): AutomationUnitDraft {
    const existing = this.units.get(unit.id);

    if (existing) {
      existing.object ??= unit.object;
      existing.event ??= unit.event;
      existing.codeUnit ??= unit.codeUnit;
      return existing;
    }

    const draft: AutomationUnitDraft = {
      ...unit,
      entryIds: new Set<number>(),
      executionIds: new Set<string>(),
      elementIds: new Set<string>(),
      metrics: {},
      flags: new Map<AutomationFlagKind, AutomationFlag>(),
      insightIds: new Set<string>(),
    };

    this.units.set(unit.id, draft);
    return draft;
  }

  private ensureExecution(
    execution: Omit<
      AutomationExecution,
      | 'entryIds'
      | 'elementIds'
      | 'soqlExecutionIds'
      | 'dmlExecutionIds'
      | 'metrics'
      | 'flags'
      | 'insightIds'
    > & { startTime?: number }
  ): AutomationExecutionDraft {
    const existing = this.executions.get(execution.id);

    if (existing) {
      existing.startEntryId ??= execution.startEntryId;
      existing.startLineNumber ??= execution.startLineNumber;
      existing.startTime ??= execution.startTime;
      return existing;
    }

    const draft: AutomationExecutionDraft = {
      ...execution,
      entryIds: new Set<number>(),
      elementIds: new Set<string>(),
      soqlExecutionIds: new Set<number>(),
      dmlExecutionIds: new Set<number>(),
      metrics: {},
      flags: new Map<AutomationFlagKind, AutomationFlag>(),
      insightIds: new Set<string>(),
    };

    this.executions.set(execution.id, draft);
    this.units.get(execution.unitId)?.executionIds.add(execution.id);
    return draft;
  }

  private ensureElement(
    unitId: string,
    name: string,
    type: string | undefined
  ): AutomationElementDraft {
    const id = `${unitId}:element:${normalizeId(type ?? 'element')}:${normalizeId(name)}`;
    const existing = this.elements.get(id);

    if (existing) {
      return existing;
    }

    const draft: AutomationElementDraft = {
      id,
      unitId,
      name,
      type,
      entryIds: new Set<number>(),
      executionIds: new Set<string>(),
      metrics: {},
    };

    this.elements.set(id, draft);
    this.units.get(unitId)?.elementIds.add(id);
    return draft;
  }

  private applyFlowSnapshotDeltas(execution: AutomationExecutionDraft) {
    if (execution.kind !== 'flow') {
      return;
    }

    const start = execution.startSnapshot;
    const finish = execution.finishSnapshot;

    if (!start || !finish) {
      for (const elementId of execution.elementIds) {
        const element = this.elements.get(elementId);

        if (element) {
          mergeMetrics(execution.metrics, element.metrics);
        }
      }

      return;
    }

    for (const metric of metricKeys) {
      const startValue = start[metric];
      const finishValue = finish[metric];

      if (typeof startValue !== 'number' || typeof finishValue !== 'number') {
        continue;
      }

      setMetric(
        execution.metrics,
        metric,
        Math.max(0, finishValue - startValue),
        'exact'
      );
    }
  }
}

export function finalizeAutomationInsights(
  automationCollector: AutomationCollector,
  insights: ProfileInsight[]
): AutomationProfile {
  automationCollector.linkInsights(insights);
  return automationCollector.finalize();
}

function getTriggerContext(entry: ApexLogEntry):
  | { triggerName?: string; object?: string; event?: string }
  | undefined {
  if (entry.event !== 'CODE_UNIT_STARTED' || !entry.metadata?.trigger) {
    return undefined;
  }

  const match = entry.metadata.trigger.match(TRIGGER_CONTEXT_PATTERN);

  return {
    triggerName: match?.groups?.triggerName?.trim(),
    object: match?.groups?.object?.trim(),
    event: match?.groups?.event?.trim(),
  };
}

function getTriggerUnitId(context: {
  triggerName?: string;
  object?: string;
  event?: string;
}): string {
  return `trigger:${normalizeId(context.object)}:${normalizeId(context.event)}:${normalizeId(context.triggerName)}`;
}

function getFlowUnitId(flowName: string): string {
  return `flow:${normalizeId(flowName)}`;
}

function getFlowExecutionId(interviewId: string): string {
  return `flow-execution:${normalizeId(interviewId)}`;
}

function getGenericUnitId(kind: AutomationKind | undefined, name: string): string {
  return `${kind ?? 'other'}:${normalizeId(name)}`;
}

function getCodeUnitKind(detail: string): AutomationKind | undefined {
  if (detail === 'execute_anonymous_apex') {
    return 'apex';
  }

  if (detail === 'DuplicateDetector') {
    return 'duplicate-rule';
  }

  if (detail.includes('Workflow:')) {
    return 'workflow';
  }

  return undefined;
}

function getCodeUnitName(detail: string): string {
  if (detail === 'execute_anonymous_apex') {
    return 'Execute Anonymous';
  }

  return detail || 'Automation';
}

const metricKeys = [
  'cpuMs',
  'soqlQueries',
  'soqlRows',
  'dmlStatements',
  'dmlRows',
] as const;

function addMetric(
  metrics: AutomationDraftMetrics,
  key: keyof AutomationMetrics,
  value: number,
  confidence: AutomationMetric['confidence']
) {
  if (value === 0) {
    return;
  }

  const existing = metrics[key];

  metrics[key] = {
    value: (existing?.value ?? 0) + value,
    confidence: mergeConfidence(existing?.confidence, confidence),
  };
}

function setMetric(
  metrics: AutomationDraftMetrics,
  key: keyof AutomationMetrics,
  value: number,
  confidence: AutomationMetric['confidence']
) {
  metrics[key] = {
    value,
    confidence,
  };
}

function mergeMetrics(
  target: AutomationDraftMetrics,
  source: AutomationDraftMetrics
) {
  for (const key of Object.keys(source) as Array<keyof AutomationMetrics>) {
    const metric = source[key];

    if (metric) {
      addMetric(target, key, metric.value, metric.confidence);
    }
  }
}

function mergeConfidence(
  left: AutomationMetric['confidence'] | undefined,
  right: AutomationMetric['confidence']
): AutomationMetric['confidence'] {
  if (!left || left === right) {
    return right;
  }

  if (left === 'exact' && right === 'exact') {
    return 'exact';
  }

  if (left === 'unknown') {
    return right;
  }

  if (right === 'unknown') {
    return left;
  }

  return 'inferred';
}

function parseFlowSnapshot(
  detail: string
): { metric: keyof UsageSnapshot; current: number } | undefined {
  return parseFlowUsage(detail, false);
}

function parseFlowDelta(
  detail: string
): { metric: keyof UsageSnapshot; delta: number } | undefined {
  const parsed = parseFlowUsage(detail, true);

  return parsed ? { metric: parsed.metric, delta: parsed.delta ?? 0 } : undefined;
}

function parseFlowUsage(
  detail: string,
  isDelta: boolean
):
  | { metric: keyof UsageSnapshot; current: number; delta?: number }
  | undefined {
  const metric = getFlowMetricKey(detail);

  if (!metric) {
    return undefined;
  }

  if (isDelta) {
    const totalIndex = detail.indexOf(', total ');

    if (totalIndex === -1) {
      return undefined;
    }

    const deltaValue = Number.parseInt(detail.slice(0, detail.indexOf(' ')), 10);
    const totalValue = Number.parseInt(detail.slice(totalIndex + ', total '.length), 10);

    if (Number.isNaN(deltaValue) || Number.isNaN(totalValue)) {
      return undefined;
    }

    return {
      metric,
      current: totalValue,
      delta: deltaValue,
    };
  }

  const separatorIndex = detail.indexOf(': ');
  const outOfIndex = detail.indexOf(' out of ', separatorIndex + 2);

  if (separatorIndex === -1 || outOfIndex === -1) {
    return undefined;
  }

  const current = Number.parseInt(
    detail.slice(separatorIndex + 2, outOfIndex),
    10
  );

  if (Number.isNaN(current)) {
    return undefined;
  }

  return {
    metric,
    current,
  };
}

function getFlowMetricKey(detail: string): keyof UsageSnapshot | undefined {
  if (detail.includes('CPU time')) {
    return 'cpuMs';
  }

  if (detail.includes('SOQL query rows')) {
    return 'soqlRows';
  }

  if (detail.includes('SOQL queries')) {
    return 'soqlQueries';
  }

  if (detail.includes('DML statements')) {
    return 'dmlStatements';
  }

  if (detail.includes('DML rows')) {
    return 'dmlRows';
  }

  return undefined;
}

function finalizeUnit(unit: AutomationUnitDraft): AutomationUnit {
  return {
    ...unit,
    entryIds: Array.from(unit.entryIds).sort((left, right) => left - right),
    executionIds: Array.from(unit.executionIds).sort(),
    elementIds: Array.from(unit.elementIds).sort(),
    flags: Array.from(unit.flags.values()).sort(compareFlags),
    insightIds: Array.from(unit.insightIds).sort(),
  };
}

function finalizeExecution(
  execution: AutomationExecutionDraft
): AutomationExecution {
  return {
    ...execution,
    entryIds: Array.from(execution.entryIds).sort((left, right) => left - right),
    elementIds: Array.from(execution.elementIds).sort(),
    soqlExecutionIds: Array.from(execution.soqlExecutionIds).sort(
      (left, right) => left - right
    ),
    dmlExecutionIds: Array.from(execution.dmlExecutionIds).sort(
      (left, right) => left - right
    ),
    flags: Array.from(execution.flags.values()).sort(compareFlags),
    insightIds: Array.from(execution.insightIds).sort(),
  };
}

function finalizeElement(element: AutomationElementDraft): AutomationElement {
  return {
    ...element,
    entryIds: Array.from(element.entryIds).sort((left, right) => left - right),
    executionIds: Array.from(element.executionIds).sort(),
  };
}

function compareAutomationUnits(left: AutomationUnit, right: AutomationUnit): number {
  return (
    (right.metrics.cpuMs?.value ?? 0) - (left.metrics.cpuMs?.value ?? 0) ||
    (right.metrics.durationMs?.value ?? 0) - (left.metrics.durationMs?.value ?? 0) ||
    (right.metrics.soqlQueries?.value ?? 0) -
      (left.metrics.soqlQueries?.value ?? 0) ||
    left.name.localeCompare(right.name)
  );
}

function compareAutomationElements(
  left: AutomationElement,
  right: AutomationElement
): number {
  return (
    (right.metrics.cpuMs?.value ?? 0) - (left.metrics.cpuMs?.value ?? 0) ||
    (right.metrics.soqlQueries?.value ?? 0) -
      (left.metrics.soqlQueries?.value ?? 0) ||
    left.name.localeCompare(right.name)
  );
}

function compareFlags(left: AutomationFlag, right: AutomationFlag): number {
  return left.kind.localeCompare(right.kind);
}

function getFlagForInsight(insight: ProfileInsight): AutomationFlag | undefined {
  if (insight.kind === 'recursion') {
    const isCascade = insight.summary.includes(' -> ');

    return {
      kind: isCascade ? 'cascade-cycle' : 'recursive',
      insightId: insight.id,
    };
  }

  if (insight.kind === 'duplicate-soql') {
    return { kind: 'duplicate-soql', insightId: insight.id };
  }

  if (insight.kind === 'performance') {
    return { kind: 'performance', insightId: insight.id };
  }

  return undefined;
}

function getEvidenceEntryIds(
  evidence: ProfileInsightEvidence | undefined
): number[] {
  if (!evidence) {
    return [];
  }

  if (isRecursionEvidence(evidence)) {
    return [
      evidence.triggerEntryId,
      ...evidence.recursiveTriggerEntryIds,
      ...evidence.dmlEntryIds,
      ...evidence.causingEntryIds,
    ];
  }

  if ('executionEntryIds' in evidence) {
    return evidence.executionEntryIds;
  }

  if ('entryId' in evidence) {
    return [evidence.entryId];
  }

  return [];
}

function isRecursionEvidence(
  evidence: ProfileInsightEvidence
): evidence is RecursionInsightEvidence {
  return 'context' in evidence;
}

function normalizeId(value: string | undefined): string {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  );
}
