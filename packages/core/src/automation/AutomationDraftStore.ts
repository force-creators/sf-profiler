import type {
  AutomationElement,
  AutomationExecution,
  AutomationFlag,
  AutomationFlagKind,
  AutomationProfile,
  AutomationUnit,
} from '../types';
import { normalizeId } from '../shared/normalize';
import {
  mergeMetrics,
  metricKeys,
  setMetric,
  type AutomationDraftMetrics,
} from './automationMetrics';
import type { UsageSnapshot } from './flowUsageParser';

export type AutomationUnitDraft = Omit<
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

export type AutomationExecutionDraft = Omit<
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

export type AutomationElementDraft = Omit<
  AutomationElement,
  'entryIds' | 'executionIds'
> & {
  entryIds: Set<number>;
  executionIds: Set<string>;
  metrics: AutomationDraftMetrics;
};

export class AutomationDraftStore {
  readonly units = new Map<string, AutomationUnitDraft>();
  readonly executions = new Map<string, AutomationExecutionDraft>();
  readonly elements = new Map<string, AutomationElementDraft>();
  readonly entryExecutionIds = new Map<number, string>();
  readonly entryUnitIds = new Map<number, string>();

  ensureUnit(
    unit: Omit<
      AutomationUnit,
      'entryIds' | 'executionIds' | 'elementIds' | 'metrics' | 'flags' | 'insightIds'
    >
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

  ensureExecution(
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

  ensureElement(
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

  linkEntryToExecution(entryId: number, executionId: string) {
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
        .sort(
          (left, right) =>
            (left.startLineNumber ?? 0) - (right.startLineNumber ?? 0)
        ),
      elements: Array.from(this.elements.values())
        .map(finalizeElement)
        .sort(compareAutomationElements),
    };
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

function compareAutomationUnits(
  left: AutomationUnit,
  right: AutomationUnit
): number {
  return (
    (right.metrics.cpuMs?.value ?? 0) - (left.metrics.cpuMs?.value ?? 0) ||
    (right.metrics.durationMs?.value ?? 0) -
      (left.metrics.durationMs?.value ?? 0) ||
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
