import type { ApexLogEntry, RecursionInsightEvidence } from '../types';
import { normalizeValue } from '../shared/normalize';

export type TriggerContext = RecursionInsightEvidence['context'] & {
  key: string;
};

export type FlowContext = RecursionInsightEvidence['context'] & {
  key: string;
};

export type AutomationContext = TriggerContext | FlowContext;

const TRIGGER_CONTEXT_PATTERN =
  /^(?<triggerName>.+?) on (?<object>.+?) trigger event (?<event>.+)$/i;

export function getAutomationContext(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): AutomationContext | undefined {
  return getTriggerContext(entry) ?? getFlowContext(entry, entriesById);
}

export function getTriggerContext(
  entry: ApexLogEntry
): TriggerContext | undefined {
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

export function getFlowContext(
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

export function isAutomationWrite(entry: ApexLogEntry): boolean {
  return entry.type === 'dml' || isFlowRecordUpdateBulkEntry(entry);
}

export function isFlowRecordUpdate(entry: ApexLogEntry): boolean {
  return entry.metadata?.flow?.elementType === 'FlowRecordUpdate';
}

export function getWriteLabel(entry: ApexLogEntry): string {
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

function isFlowRecordUpdateBulkEntry(entry: ApexLogEntry): boolean {
  return (
    entry.event === 'FLOW_BULK_ELEMENT_BEGIN' &&
    entry.metadata?.flow?.elementType === 'FlowRecordUpdate'
  );
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
      current.parentId === undefined
        ? undefined
        : entriesById.get(current.parentId);
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
      current.parentId === undefined
        ? undefined
        : entriesById.get(current.parentId);
  }

  return undefined;
}

function formatTriggerEvent(event: string): string {
  return event.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}
