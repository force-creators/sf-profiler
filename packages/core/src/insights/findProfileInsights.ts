import type {
  ApexLogProfile,
  PerformanceInsightThresholds,
  ProfileInsight,
} from '../types';
import { findDuplicateSoqlInsights } from './duplicateSoqlInsights';
import { getInsightContextKey } from './insightUtils';
import { findPerformanceInsights } from './performanceInsights';
import { findAutomationCycleInsights } from './recursion/automationCycleInsights';
import { findFlowRecursionInsights } from './recursion/flowRecursionInsights';
import { findTriggerRecursionInsights } from './recursion/triggerRecursionInsights';

export { defaultPerformanceInsightThresholds } from './performanceInsights';

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
      (insight) =>
        !automationCycleContextKeys.has(getInsightContextKey(insight.evidence) ?? '')
    ),
    ...findDuplicateSoqlInsights(profile.soqlExecutions),
    ...findPerformanceInsights(profile.entries, performanceThresholds),
  ];
}
