import type { ApexLogEntry, AutomationKind } from '../types';
import { normalizeId } from '../shared/normalize';

const TRIGGER_CONTEXT_PATTERN =
  /^(?<triggerName>.+?) on (?<object>.+?) trigger event (?<event>.+)$/i;

export function getTriggerContext(entry: ApexLogEntry):
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

export function getTriggerUnitId(context: {
  triggerName?: string;
  object?: string;
  event?: string;
}): string {
  return `trigger:${normalizeId(context.object)}:${normalizeId(context.event)}:${normalizeId(context.triggerName)}`;
}

export function getFlowUnitId(flowName: string): string {
  return `flow:${normalizeId(flowName)}`;
}

export function getFlowExecutionId(interviewId: string): string {
  return `flow-execution:${normalizeId(interviewId)}`;
}

export function getGenericUnitId(
  kind: AutomationKind | undefined,
  name: string
): string {
  return `${kind ?? 'other'}:${normalizeId(name)}`;
}

export function getCodeUnitKind(
  detail: string
): AutomationKind | undefined {
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

export function getCodeUnitName(detail: string): string {
  if (detail === 'execute_anonymous_apex') {
    return 'Execute Anonymous';
  }

  return detail || 'Automation';
}
