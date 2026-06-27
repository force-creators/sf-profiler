import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Workflow,
} from 'lucide-react';
import type {
  ApexLogProfile,
  AutomationElement,
  AutomationExecution,
  AutomationFlag,
  AutomationKind,
  AutomationMetric,
  AutomationUnit,
} from '@sfdc-profiler/core';

type AutomationTabId = 'all' | 'flow' | 'trigger' | 'other';

type AutomationTab = {
  id: AutomationTabId;
  label: string;
};

const automationTabs: AutomationTab[] = [
  { id: 'all', label: 'All' },
  { id: 'flow', label: 'Flow' },
  { id: 'trigger', label: 'Trigger' },
  { id: 'other', label: 'Other' },
];

export function AutomationView({
  jumpRequest,
  onOpenInsight,
  onSelectTimelineEntry,
  profile,
}: {
  jumpRequest?: { unitId?: string; nonce: number };
  onOpenInsight: (insightId: string) => void;
  onSelectTimelineEntry: (entryId: number) => void;
  profile: ApexLogProfile;
}) {
  const automation = profile.automation ?? {
    units: [],
    executions: [],
    elements: [],
  };
  const [activeTab, setActiveTab] = useState<AutomationTabId>('all');
  const [expandedUnitIds, setExpandedUnitIds] = useState<Set<string>>(
    () => new Set(automation.units[0]?.id ? [automation.units[0].id] : [])
  );
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const jumpTargetUnitId = jumpRequest?.unitId;
  const unitsById = useMemo(
    () => new Map(automation.units.map((unit) => [unit.id, unit])),
    [automation.units]
  );
  const executionsByUnitId = useMemo(() => {
    const groups = new Map<string, AutomationExecution[]>();

    for (const execution of automation.executions) {
      const executions = groups.get(execution.unitId) ?? [];
      executions.push(execution);
      groups.set(execution.unitId, executions);
    }

    return groups;
  }, [automation.executions]);
  const elementsByUnitId = useMemo(() => {
    const groups = new Map<string, AutomationElement[]>();

    for (const element of automation.elements) {
      const elements = groups.get(element.unitId) ?? [];
      elements.push(element);
      groups.set(element.unitId, elements);
    }

    return groups;
  }, [automation.elements]);
  const tabCounts = useMemo(
    () =>
      automationTabs.reduce(
        (counts, tab) => {
          counts[tab.id] = automation.units.filter((unit) =>
            isUnitInTab(unit, tab.id)
          ).length;
          return counts;
        },
        {} as Record<AutomationTabId, number>
      ),
    [automation.units]
  );
  const visibleUnits = useMemo(
    () =>
      automation.units
        .filter((unit) => isUnitInTab(unit, activeTab))
        .sort(compareAutomationUnits),
    [activeTab, automation.units]
  );
  useEffect(() => {
    if (!jumpRequest?.unitId) {
      return;
    }

    const unit = unitsById.get(jumpRequest.unitId);

    if (!unit) {
      return;
    }

    setActiveTab(getTabForUnit(unit));
    setExpandedUnitIds(new Set([unit.id]));
  }, [jumpRequest, unitsById]);

  useEffect(() => {
    if (!jumpTargetUnitId) {
      return undefined;
    }

    if (!visibleUnits.some((unit) => unit.id === jumpTargetUnitId)) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      cardRefs.current.get(jumpTargetUnitId)?.scrollIntoView({
        block: 'start',
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [jumpRequest?.nonce, jumpTargetUnitId, visibleUnits]);

  useEffect(() => {
    setExpandedUnitIds((currentIds) => {
      const visibleUnitIds = new Set(visibleUnits.map((unit) => unit.id));
      const nextIds = new Set(
        Array.from(currentIds).filter((unitId) => visibleUnitIds.has(unitId))
      );

      if (nextIds.size === 0 && visibleUnits[0]) {
        nextIds.add(visibleUnits[0].id);
      }

      return nextIds;
    });
  }, [visibleUnits]);

  function toggleUnitExpanded(unitId: string) {
    setExpandedUnitIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(unitId)) {
        nextIds.delete(unitId);
      } else {
        nextIds.add(unitId);
      }

      return nextIds;
    });
  }

  if (automation.units.length === 0) {
    return (
      <div className="automation-layout">
        <section className="panel automation-empty-panel">
          <div className="panel-title">
            <Workflow size={18} aria-hidden="true" />
            <h3>No automation breakdown found</h3>
          </div>
          <p className="muted">
            This log does not contain supported automation execution markers.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="automation-layout">
      <nav className="automation-tabs" aria-label="Automation types" role="tablist">
        {automationTabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              aria-selected={isActive}
              className={isActive ? 'active' : ''}
              disabled={tabCounts[tab.id] === 0}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              <span>{tab.label}</span>
              <strong>{tabCounts[tab.id]}</strong>
            </button>
          );
        })}
      </nav>

      <div className="automation-content">
        <section className="automation-card-stack">
          <header className="automation-panel-header">
            <div>
              <h3>Automation Cost</h3>
              <p className="muted">{visibleUnits.length} grouped units</p>
            </div>
          </header>
          <ol className="automation-card-list">
            {visibleUnits.map((unit) => (
              <li
                className={
                  unit.id === jumpTargetUnitId ? 'automation-card-jump-target' : ''
                }
                key={unit.id}
                ref={(node) => {
                  if (node) {
                    cardRefs.current.set(unit.id, node);
                  } else {
                    cardRefs.current.delete(unit.id);
                  }
                }}
              >
                <AutomationCard
                  elements={elementsByUnitId.get(unit.id) ?? []}
                  executions={executionsByUnitId.get(unit.id) ?? []}
                  isExpanded={expandedUnitIds.has(unit.id)}
                  onOpenInsight={onOpenInsight}
                  onSelectTimelineEntry={onSelectTimelineEntry}
                  onToggleExpanded={() => toggleUnitExpanded(unit.id)}
                  unit={unit}
                />
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function AutomationCard({
  elements,
  executions,
  isExpanded,
  onOpenInsight,
  onSelectTimelineEntry,
  onToggleExpanded,
  unit,
}: {
  elements: AutomationElement[];
  executions: AutomationExecution[];
  isExpanded: boolean;
  onOpenInsight: (insightId: string) => void;
  onSelectTimelineEntry: (entryId: number) => void;
  onToggleExpanded: () => void;
  unit: AutomationUnit;
}) {
  const sortedElements = [...elements].sort(compareAutomationElements).slice(0, 8);
  const sortedExecutions = [...executions].sort(
    (left, right) =>
      (left.startLineNumber ?? 0) - (right.startLineNumber ?? 0)
  );

  return (
    <section
      className={`panel automation-card${isExpanded ? '' : ' automation-card-collapsed'}`}
    >
      <header
        className="automation-card-header"
        onClick={onToggleExpanded}
        title={isExpanded ? 'Collapse details' : 'Expand details'}
      >
        <button
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${unit.name}`}
          className="insight-expand-button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpanded();
          }}
          title={isExpanded ? 'Collapse details' : 'Expand details'}
          type="button"
        >
          {isExpanded ? (
            <ChevronDown size={18} aria-hidden="true" />
          ) : (
            <ChevronRight size={18} aria-hidden="true" />
          )}
        </button>

        <div className="automation-card-title">
          <h3>{unit.name}</h3>
          <p>{formatAutomationSubtitle(unit)}</p>
          <SummaryStatList stats={formatAutomationSummaryStats(unit)} />
        </div>

        <FlagList flags={unit.flags} onOpenInsight={onOpenInsight} />
      </header>

      {isExpanded && (
        <div className="automation-card-details">
          <section className="automation-detail-section">
            <h4>Executions</h4>
            <div className="automation-execution-row automation-table-heading">
              <span>Run</span>
              <span>CPU</span>
              <span>Duration</span>
              <span>SOQL</span>
              <span>DML</span>
              <span>Flags</span>
            </div>
            <ol className="automation-execution-list">
              {sortedExecutions.map((execution, index) => (
                <li key={execution.id}>
                  <button
                    className="automation-execution-row"
                    disabled={execution.startEntryId === undefined}
                    onClick={() => {
                      if (execution.startEntryId !== undefined) {
                        onSelectTimelineEntry(execution.startEntryId);
                      }
                    }}
                    type="button"
                  >
                    <span>
                      <strong>Run {index + 1}</strong>
                      <small>
                        {execution.startLineNumber
                          ? `Line ${execution.startLineNumber}`
                          : 'Line -'}
                      </small>
                    </span>
                    <span>{formatMetric(execution.metrics.cpuMs, 'ms')}</span>
                    <span>{formatMetric(execution.metrics.durationMs, 'ms')}</span>
                    <span>{formatMetric(execution.metrics.soqlQueries)}</span>
                    <span>{formatMetric(execution.metrics.dmlStatements)}</span>
                    <FlagList
                      flags={execution.flags}
                      onOpenInsight={onOpenInsight}
                    />
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {sortedElements.length > 0 && (
            <section className="automation-detail-section">
              <h4>Top Elements</h4>
              <div className="automation-element-row automation-table-heading">
                <span>Element</span>
                <span>CPU</span>
                <span>SOQL</span>
                <span>Rows</span>
                <span>DML</span>
                <span>Rows</span>
              </div>
              <ol className="automation-element-list">
                {sortedElements.map((element) => (
                  <li key={element.id}>
                    <button
                      className="automation-element-row"
                      disabled={element.entryIds[0] === undefined}
                      onClick={() => {
                        const entryId = element.entryIds[0];

                        if (entryId !== undefined) {
                          onSelectTimelineEntry(entryId);
                        }
                      }}
                      type="button"
                    >
                      <span>
                        <strong>{element.name}</strong>
                        <small>{element.type ?? 'Element'}</small>
                      </span>
                      <span>{formatMetric(element.metrics.cpuMs, 'ms')}</span>
                      <span>{formatMetric(element.metrics.soqlQueries)}</span>
                      <span>{formatMetric(element.metrics.soqlRows)}</span>
                      <span>{formatMetric(element.metrics.dmlStatements)}</span>
                      <span>{formatMetric(element.metrics.dmlRows)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

function SummaryStatList({ stats }: { stats: string[] }) {
  return (
    <span className="automation-stat-list" aria-label="Automation summary">
      {stats.map((stat) => (
        <span className="automation-stat" key={stat}>
          {stat}
        </span>
      ))}
    </span>
  );
}

function formatAutomationSubtitle(unit: AutomationUnit): string {
  return [formatKind(unit.kind), unit.object, unit.event]
    .filter(Boolean)
    .join(' - ');
}

function formatAutomationSummaryStats(unit: AutomationUnit): string[] {
  return [
    `Runs: ${unit.executionIds.length.toLocaleString()}`,
    unit.metrics.cpuMs
      ? `CPU: ${formatCompactMetric(unit.metrics.cpuMs, 'ms')}`
      : undefined,
    unit.metrics.durationMs
      ? `Total: ${formatCompactMetric(unit.metrics.durationMs, 'ms')}`
      : undefined,
    unit.metrics.soqlQueries
      ? `SOQL: ${unit.metrics.soqlQueries.value.toLocaleString()}`
      : undefined,
    unit.metrics.dmlStatements
      ? `DML: ${unit.metrics.dmlStatements.value.toLocaleString()}`
      : undefined,
  ]
    .filter((stat): stat is string => Boolean(stat));
}

function FlagList({
  flags,
  onOpenInsight,
}: {
  flags: AutomationFlag[];
  onOpenInsight: (insightId: string) => void;
}) {
  if (flags.length === 0) {
    return <span className="automation-flag-empty">-</span>;
  }

  return (
    <span className="automation-flag-list">
      {flags.map((flag) => (
        <button
          className={`automation-flag automation-flag-${flag.kind}`}
          disabled={!flag.insightId}
          key={`${flag.kind}-${flag.insightId ?? 'none'}`}
          onClick={(event) => {
            event.stopPropagation();

            if (flag.insightId) {
              onOpenInsight(flag.insightId);
            }
          }}
          title={formatFlag(flag.kind)}
          type="button"
        >
          {flag.kind === 'recursive' || flag.kind === 'cascade-cycle' ? (
            <GitBranch size={13} aria-hidden="true" />
          ) : (
            <AlertTriangle size={13} aria-hidden="true" />
          )}
          {formatFlag(flag.kind)}
        </button>
      ))}
    </span>
  );
}

function isUnitInTab(unit: AutomationUnit, tab: AutomationTabId): boolean {
  if (tab === 'all') {
    return true;
  }

  if (tab === 'other') {
    return unit.kind !== 'flow' && unit.kind !== 'trigger';
  }

  return unit.kind === tab;
}

function getTabForUnit(unit: AutomationUnit): AutomationTabId {
  if (unit.kind === 'flow' || unit.kind === 'trigger') {
    return unit.kind;
  }

  return 'other';
}

function compareAutomationUnits(left: AutomationUnit, right: AutomationUnit): number {
  return (
    getMetricValue(right.metrics.cpuMs) - getMetricValue(left.metrics.cpuMs) ||
    getMetricValue(right.metrics.durationMs) -
      getMetricValue(left.metrics.durationMs) ||
    getMetricValue(right.metrics.soqlQueries) -
      getMetricValue(left.metrics.soqlQueries) ||
    left.name.localeCompare(right.name)
  );
}

function compareAutomationElements(
  left: AutomationElement,
  right: AutomationElement
): number {
  return (
    getMetricValue(right.metrics.cpuMs) - getMetricValue(left.metrics.cpuMs) ||
    getMetricValue(right.metrics.soqlQueries) -
      getMetricValue(left.metrics.soqlQueries) ||
    left.name.localeCompare(right.name)
  );
}

function getMetricValue(metric?: AutomationMetric): number {
  return metric?.value ?? 0;
}

function formatMetric(metric?: AutomationMetric, unit?: 'ms'): string {
  if (!metric) {
    return '-';
  }

  const suffixes = [
    unit,
    metric.confidence === 'exact' || metric.confidence === 'duration'
      ? undefined
      : 'inferred',
  ].filter(Boolean);

  return `${metric.value.toLocaleString()}${
    suffixes.length > 0 ? ` ${suffixes.join(' ')}` : ''
  }`;
}

function formatCompactMetric(metric: AutomationMetric, unit: 'ms'): string {
  const value = `${metric.value.toLocaleString()}${unit}`;

  return metric.confidence === 'exact' || metric.confidence === 'duration'
    ? value
    : `${value} inferred`;
}

function formatKind(kind: AutomationKind): string {
  if (kind === 'duplicate-rule') {
    return 'Duplicate Rule';
  }

  if (kind === 'process-builder') {
    return 'Process Builder';
  }

  return kind
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatAutomationContext(unit: AutomationUnit): string {
  return [unit.object, unit.event].filter(Boolean).join(' / ') || unit.codeUnit || '-';
}

function formatFlag(flag: AutomationFlag['kind']): string {
  if (flag === 'cascade-cycle') {
    return 'Cycle';
  }

  if (flag === 'duplicate-soql') {
    return 'Duplicate SOQL';
  }

  return flag.charAt(0).toUpperCase() + flag.slice(1);
}
