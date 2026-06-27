import type { AutomationMetric, AutomationMetrics } from '../types';

export type AutomationDraftMetrics = {
  durationMs?: AutomationMetric;
  cpuMs?: AutomationMetric;
  soqlQueries?: AutomationMetric;
  soqlRows?: AutomationMetric;
  dmlStatements?: AutomationMetric;
  dmlRows?: AutomationMetric;
};

export const metricKeys = [
  'cpuMs',
  'soqlQueries',
  'soqlRows',
  'dmlStatements',
  'dmlRows',
] as const;

export function addMetric(
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

export function setMetric(
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

export function mergeMetrics(
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
