import type {
  ApexLogEntry,
  PerformanceInsightCategory,
  PerformanceInsightEvidence,
  PerformanceInsightThresholds,
  ProfileInsight,
  ProfileInsightEvidence,
} from '../types';
import { compactQuery, formatMilliseconds } from './insightUtils';

export const defaultPerformanceInsightThresholds: PerformanceInsightThresholds = {
  dml: 1500,
  soql: 300,
  apex: 1000,
  flow: 1000,
};

export function findPerformanceInsights(
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
          getPerformanceDuration(left.evidence) ||
        left.entryIds[0] - right.entryIds[0]
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
