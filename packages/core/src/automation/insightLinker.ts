import type {
  AutomationFlag,
  ProfileInsight,
  ProfileInsightEvidence,
  RecursionInsightEvidence,
} from '../types';
import type { AutomationDraftStore } from './AutomationDraftStore';

export function linkAutomationInsights(
  store: AutomationDraftStore,
  insights: ProfileInsight[]
) {
  for (const insight of insights) {
    const executionIds = new Set<string>();
    const unitIds = new Set<string>();

    for (const entryId of insight.entryIds) {
      collectEntryAutomationIds(store, entryId, executionIds, unitIds);
    }

    const evidenceEntryIds = getEvidenceEntryIds(insight.evidence);

    for (const entryId of evidenceEntryIds) {
      collectEntryAutomationIds(store, entryId, executionIds, unitIds);
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
      const execution = store.executions.get(executionId);

      if (execution) {
        execution.flags.set(flag.kind, flag);
        execution.insightIds.add(insight.id);
      }
    }

    for (const unitId of unitIds) {
      const unit = store.units.get(unitId);

      if (unit) {
        unit.flags.set(flag.kind, flag);
        unit.insightIds.add(insight.id);
      }
    }
  }
}

function collectEntryAutomationIds(
  store: AutomationDraftStore,
  entryId: number,
  executionIds: Set<string>,
  unitIds: Set<string>
) {
  const executionId = store.entryExecutionIds.get(entryId);
  const unitId = store.entryUnitIds.get(entryId);

  if (executionId) {
    executionIds.add(executionId);
    const execution = store.executions.get(executionId);

    if (execution) {
      unitIds.add(execution.unitId);
    }
  }

  if (unitId) {
    unitIds.add(unitId);
  }
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
