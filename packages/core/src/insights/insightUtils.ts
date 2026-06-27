import type {
  ProfileInsightEvidence,
  RecursionInsightEvidence,
} from '../types';
import { normalizeValue } from '../shared/normalize';

export function getInsightContextKey(
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
    return [
      normalizeValue(evidence.context.object),
      normalizeValue(evidence.context.event),
    ]
      .filter(Boolean)
      .join(':');
  }

  return normalizeValue(evidence.context.label);
}

export function isRecursionInsightEvidence(
  evidence: ProfileInsightEvidence | undefined
): evidence is RecursionInsightEvidence {
  return Boolean(evidence && 'context' in evidence);
}

export function sumDefinedNumbers(
  values: Array<number | undefined>
): number | undefined {
  const definedValues = values.filter(
    (value): value is number => typeof value === 'number'
  );

  if (definedValues.length === 0) {
    return undefined;
  }

  return definedValues.reduce((total, value) => total + value, 0);
}

export function compactQuery(query: string): string {
  const compacted = query.replace(/\s+/g, ' ').trim();

  if (compacted.length <= 110) {
    return compacted;
  }

  return `${compacted.slice(0, 109)}...`;
}

export function formatMilliseconds(milliseconds: number): string {
  return `${milliseconds.toLocaleString('en-US')} ms`;
}
