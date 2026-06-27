import type {
  ApexLogEntry,
  AutomationKind,
  AutomationProfile,
  DmlExecution,
  ProfileInsight,
  SoqlExecution,
} from '../types';
import {
  getCodeUnitKind,
  getCodeUnitName,
  getFlowExecutionId,
  getFlowUnitId,
  getGenericUnitId,
  getTriggerContext,
  getTriggerUnitId,
} from './automationIds';
import { addMetric, setMetric } from './automationMetrics';
import {
  AutomationDraftStore,
  type AutomationExecutionDraft,
} from './AutomationDraftStore';
import { parseFlowDelta, parseFlowSnapshot } from './flowUsageParser';
import { linkAutomationInsights } from './insightLinker';

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

export class AutomationCollector {
  private readonly store = new AutomationDraftStore();
  private readonly codeUnitStack: CodeUnitContext[] = [];
  private readonly flowInterviews = new Map<
    string,
    { executionId: string; flowName: string; object?: string }
  >();

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
      this.store.linkEntryToExecution(entry.id, executionId);
    }
  }

  recordSoqlExecution(execution: SoqlExecution) {
    const executionId = this.store.entryExecutionIds.get(execution.entryId);

    if (!executionId) {
      return;
    }

    const automationExecution = this.store.executions.get(executionId);

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
    const executionId = this.store.entryExecutionIds.get(execution.entryId);

    if (!executionId) {
      return;
    }

    const automationExecution = this.store.executions.get(executionId);

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
    return this.store.finalize();
  }

  linkInsights(insights: ProfileInsight[]) {
    linkAutomationInsights(this.store, insights);
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

    const kind: AutomationKind = triggerContext
      ? 'trigger'
      : (codeUnitKind ?? 'other');
    const name = triggerContext?.triggerName ?? getCodeUnitName(detail);
    const unitId = triggerContext
      ? getTriggerUnitId(triggerContext)
      : getGenericUnitId(kind, name);
    const executionId = `${unitId}:${entry.id}`;
    const unit = this.store.ensureUnit({
      id: unitId,
      kind,
      name,
      object: triggerContext?.object,
      event: triggerContext?.event,
      codeUnit: detail,
    });
    const execution = this.store.ensureExecution({
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
    this.store.entryExecutionIds.set(entry.id, executionId);
    this.store.entryUnitIds.set(entry.id, unitId);
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
    const execution = this.store.executions.get(topContext.executionId);

    if (!execution) {
      return;
    }

    execution.endEntryId = entry.id;
    execution.endLineNumber = entry.lineNumber;
    execution.entryIds.add(entry.id);
    this.store.entryExecutionIds.set(entry.id, execution.id);
    this.store.entryUnitIds.set(entry.id, execution.unitId);

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
    const unit = this.store.ensureUnit({
      id: unitId,
      kind: 'flow',
      name: flowName,
      object,
      codeUnit: object ? `Flow:${object}` : undefined,
    });
    const execution = this.store.ensureExecution({
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
    this.store.entryExecutionIds.set(entry.id, executionId);
    this.store.entryUnitIds.set(entry.id, unitId);

    if (context) {
      context.latestInterviewId = interviewId;

      if (context.startEntryId !== undefined) {
        this.store.linkEntryToExecution(context.startEntryId, executionId);
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
      entry.metadata?.flow?.interviewId ??
      this.getCurrentFlowContext()?.latestInterviewId;

    if (!interviewId) {
      return;
    }

    const execution = this.getFlowExecution(interviewId);

    if (!execution) {
      return;
    }

    const elementType = entry.metadata?.flow?.elementType;
    const elementName = entry.metadata?.flow?.elementName ?? entry.detail;
    const element = this.store.ensureElement(
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
      ? this.store.elements.get(context.currentElementId)
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
      const element = this.store.elements.get(context.currentElementId);

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

    this.store.ensureUnit({
      id: unitId,
      kind: 'flow',
      name: flowName,
      object,
      codeUnit: object ? `Flow:${object}` : undefined,
    });
    this.store.ensureExecution({
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
      ? this.store.executions.get(flowInterview.executionId)
      : undefined;
  }

  private linkFlowEntry(entry: ApexLogEntry, interviewId: string) {
    const execution = this.getFlowExecution(interviewId);

    if (!execution) {
      return;
    }

    this.store.linkEntryToExecution(entry.id, execution.id);
  }
}

export function finalizeAutomationInsights(
  automationCollector: AutomationCollector,
  insights: ProfileInsight[]
): AutomationProfile {
  automationCollector.linkInsights(insights);
  return automationCollector.finalize();
}
