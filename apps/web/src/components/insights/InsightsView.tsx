import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CircleDot,
  GitBranch,
  Lightbulb,
  Repeat2,
  Workflow,
} from 'lucide-react';
import type {
  ApexLogEntry,
  ApexLogProfile,
  DuplicateSoqlInsightEvidence,
  PerformanceInsightEvidence,
  ProfileInsight,
  ProfileInsightEvidence,
  ProfileInsightKind,
  RecursionInsightEvidence,
} from '@sfdc-profiler/core';

type InsightTab = {
  kind: ProfileInsightKind;
  label: string;
};

const insightTabs: InsightTab[] = [
  { kind: 'recursion', label: 'Recursion' },
  { kind: 'duplicate-soql', label: 'Duplicate SOQL' },
  { kind: 'performance', label: 'Performance' },
];

export function InsightsView({
  jumpRequest,
  onSelectTimelineEntry,
  profile,
}: {
  jumpRequest?: { insightId: string; nonce: number };
  onSelectTimelineEntry: (entryId: number) => void;
  profile: ApexLogProfile;
}) {
  const insights = profile.insights ?? [];
  const entriesById = new Map(profile.entries.map((entry) => [entry.id, entry]));
  const firstAvailableKind = getFirstAvailableInsightKind(insights);
  const [activeInsightKind, setActiveInsightKind] =
    useState<ProfileInsightKind>(firstAvailableKind);
  const [expandedInsightIds, setExpandedInsightIds] = useState<Set<string>>(
    () => new Set()
  );
  const insightsByKind = useMemo(
    () =>
      insightTabs.reduce(
        (groups, tab) => {
          groups[tab.kind] = insights.filter((insight) => insight.kind === tab.kind);
          return groups;
        },
        {} as Record<ProfileInsightKind, ProfileInsight[]>
      ),
    [insights]
  );
  const activeInsights = insightsByKind[activeInsightKind] ?? [];

  useEffect(() => {
    if (insightsByKind[activeInsightKind]?.length === 0) {
      setActiveInsightKind(firstAvailableKind);
    }
  }, [activeInsightKind, firstAvailableKind, insightsByKind]);

  useEffect(() => {
    setExpandedInsightIds(new Set());
  }, [profile]);

  useEffect(() => {
    if (!jumpRequest) {
      return;
    }

    const targetInsight = insights.find(
      (insight) => insight.id === jumpRequest.insightId
    );

    if (!targetInsight) {
      return;
    }

    setActiveInsightKind(targetInsight.kind);
    setExpandedInsightIds(new Set([targetInsight.id]));
  }, [insights, jumpRequest]);

  function toggleInsightExpanded(insightId: string) {
    setExpandedInsightIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(insightId)) {
        nextIds.delete(insightId);
      } else {
        nextIds.add(insightId);
      }

      return nextIds;
    });
  }

  if (insights.length === 0) {
    return (
      <div className="insights-layout">
        <section className="panel insights-empty-panel">
          <div className="panel-title">
            <Lightbulb size={18} aria-hidden="true" />
            <h3>No insights found</h3>
          </div>
          <p className="muted">
            This log does not show recursion or other profiler insights yet.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="insights-layout">
      <nav className="insights-tabs" aria-label="Insight types" role="tablist">
        {insightTabs.map((tab) => {
          const tabInsights = insightsByKind[tab.kind];
          const isActive = activeInsightKind === tab.kind;
          const isDisabled = tabInsights.length === 0;
          const tabPanelId = getInsightTabPanelId(tab.kind);

          return (
            <button
              aria-controls={tabPanelId}
              aria-selected={isActive}
              className={isActive ? 'active' : ''}
              disabled={isDisabled}
              id={getInsightTabId(tab.kind)}
              key={tab.kind}
              onClick={() => setActiveInsightKind(tab.kind)}
              role="tab"
              type="button"
            >
              <span>{tab.label}</span>
              <strong>{tabInsights.length}</strong>
            </button>
          );
        })}
      </nav>

      <div
        aria-labelledby={getInsightTabId(activeInsightKind)}
        className="insights-tab-panel"
        id={getInsightTabPanelId(activeInsightKind)}
        role="tabpanel"
      >
        {activeInsights.map((insight) => (
          <InsightCard
            entriesById={entriesById}
            isExpanded={expandedInsightIds.has(insight.id)}
            insight={insight}
            key={insight.id}
            onSelectTimelineEntry={onSelectTimelineEntry}
            onToggleExpanded={() => toggleInsightExpanded(insight.id)}
          />
        ))}
      </div>
    </div>
  );
}

function getFirstAvailableInsightKind(
  insights: ProfileInsight[]
): ProfileInsightKind {
  return (
    insightTabs.find((tab) =>
      insights.some((insight) => insight.kind === tab.kind)
    )?.kind ?? 'recursion'
  );
}

function getInsightTabId(kind: ProfileInsightKind): string {
  return `insight-tab-${kind}`;
}

function getInsightTabPanelId(kind: ProfileInsightKind): string {
  return `insight-tab-panel-${kind}`;
}

function getInsightDetailsId(insightId: string): string {
  return `insight-details-${insightId}`;
}

function InsightCard({
  entriesById,
  isExpanded,
  insight,
  onSelectTimelineEntry,
  onToggleExpanded,
}: {
  entriesById: Map<number, ApexLogEntry>;
  isExpanded: boolean;
  insight: ProfileInsight;
  onSelectTimelineEntry: (entryId: number) => void;
  onToggleExpanded: () => void;
}) {
  const evidence = insight.evidence;
  const recursionEvidence =
    insight.kind === 'recursion' && isRecursionInsightEvidence(evidence)
      ? evidence
      : undefined;
  const duplicateSoqlEvidence =
    insight.kind === 'duplicate-soql' &&
    isDuplicateSoqlInsightEvidence(evidence)
      ? evidence
      : undefined;
  const performanceEvidence =
    insight.kind === 'performance' && isPerformanceInsightEvidence(evidence)
      ? evidence
      : undefined;

  return (
    <section
      className={`panel insight-card${isExpanded ? '' : ' insight-card-collapsed'}`}
    >
      <header
        className="insight-card-header"
        onClick={onToggleExpanded}
        title={isExpanded ? 'Collapse details' : 'Expand details'}
      >
        <button
          aria-controls={getInsightDetailsId(insight.id)}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${insight.title}`}
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
        <div className="insight-title-group">
          <h3>{insight.title}</h3>
          <p>{insight.summary}</p>
        </div>
        <span
          className={`insight-severity insight-severity-${insight.severity}`}
        >
          <AlertTriangle size={16} aria-hidden="true" />
          {insight.severity}
        </span>
      </header>

      {isExpanded && (
        <div className="insight-card-details" id={getInsightDetailsId(insight.id)}>
          {recursionEvidence && (
            <RecursionInsightDetails
              entriesById={entriesById}
              evidence={recursionEvidence}
              insight={insight}
              onSelectTimelineEntry={onSelectTimelineEntry}
            />
          )}

          {duplicateSoqlEvidence && (
            <DuplicateSoqlInsightDetails
              entriesById={entriesById}
              evidence={duplicateSoqlEvidence}
              onSelectTimelineEntry={onSelectTimelineEntry}
            />
          )}

          {performanceEvidence && (
            <PerformanceInsightDetails
              entriesById={entriesById}
              evidence={performanceEvidence}
              onSelectTimelineEntry={onSelectTimelineEntry}
            />
          )}
        </div>
      )}
    </section>
  );
}

function RecursionInsightDetails({
  entriesById,
  evidence,
  insight,
  onSelectTimelineEntry,
}: {
  entriesById: Map<number, ApexLogEntry>;
  evidence: RecursionInsightEvidence;
  insight: ProfileInsight;
  onSelectTimelineEntry: (entryId: number) => void;
}) {
  const dmlEntries = evidence.dmlEntryIds
    .map((entryId) => entriesById.get(entryId))
    .filter((entry): entry is ApexLogEntry => Boolean(entry));
  const causingEntries = evidence.causingEntryIds
    .map((entryId) => entriesById.get(entryId))
    .filter((entry): entry is ApexLogEntry => Boolean(entry));
  const recursiveTriggerEntries = evidence.recursiveTriggerEntryIds
    .map((entryId) => entriesById.get(entryId))
    .filter((entry): entry is ApexLogEntry => Boolean(entry));
  const isFlowInsight = evidence.context.kind === 'flow';
  const flowElementCauseEntries = causingEntries.filter(
    (entry) => entry.metadata?.flow?.elementName
  );
  const likelyCauseEntries =
    isFlowInsight && flowElementCauseEntries.length > 0
      ? flowElementCauseEntries
      : dmlEntries.length > 0
        ? dmlEntries
        : causingEntries;
  const cycleSteps = getRecursionCycleSteps(insight.summary, evidence.context.label);

  return (
    <div className="recursion-insight">
      <section className="recursion-loop-panel">
        <div className="recursion-loop-heading">
          <span
            className="recursion-loop-icon"
          >
            <Repeat2 size={18} aria-hidden="true" />
          </span>
          <div>
            <h4>Detected Cycle</h4>
            <p>{cycleSteps.length} automation steps repeat in this execution path.</p>
          </div>
        </div>

        <ol className="recursion-cycle-list">
          {cycleSteps.map((step, index) => (
            <li key={`${step}-${index}`}>
              <span className="recursion-cycle-index">{index + 1}</span>
              <span className="recursion-cycle-label">{step}</span>
              {index < cycleSteps.length - 1 && (
                <ArrowRight size={16} aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="recursion-support-grid">
        <section className="recursion-context-section">
          <div className="recursion-section-heading">
            <Workflow size={16} aria-hidden="true" />
            <h4>Recursive Context</h4>
          </div>
          <dl className="insight-facts recursion-context-facts">
            <div>
              <dt>Context</dt>
              <dd>{evidence.context.label}</dd>
            </div>
            {evidence.context.triggerName && (
              <div>
                <dt>Trigger</dt>
                <dd>{evidence.context.triggerName}</dd>
              </div>
            )}
            {evidence.context.flowName && (
              <div>
                <dt>Flow</dt>
                <dd>{evidence.context.flowName}</dd>
              </div>
            )}
            {evidence.context.object && (
              <div>
                <dt>Object</dt>
                <dd>{evidence.context.object}</dd>
              </div>
            )}
          </dl>
        </section>

        <section>
          <div className="recursion-section-heading">
            <CircleDot size={16} aria-hidden="true" />
            <h4>Likely Cause</h4>
          </div>
          <EntryButtonList
            entries={likelyCauseEntries}
            fallback="No likely cause details found."
            onSelectTimelineEntry={onSelectTimelineEntry}
          />
        </section>

        <section>
          <div className="recursion-section-heading">
            <GitBranch size={16} aria-hidden="true" />
            <h4>{isFlowInsight ? 'Recursive Flow Entries' : 'Recursive Trigger Entries'}</h4>
          </div>
          <EntryButtonList
            entries={recursiveTriggerEntries}
            fallback={
              isFlowInsight
                ? 'No recursive flow entries found.'
                : 'No recursive trigger entries found.'
            }
            onSelectTimelineEntry={onSelectTimelineEntry}
          />
        </section>

        <section className="recursion-path-section">
          <div className="recursion-section-heading">
            <GitBranch size={16} aria-hidden="true" />
            <h4>Path Inside The DML</h4>
          </div>
          <EntryButtonList
            className="recursion-path-list"
            entries={causingEntries}
            fallback="No nested path details found."
            onSelectTimelineEntry={onSelectTimelineEntry}
          />
        </section>
      </div>
    </div>
  );
}

function DuplicateSoqlInsightDetails({
  entriesById,
  evidence,
  onSelectTimelineEntry,
}: {
  entriesById: Map<number, ApexLogEntry>;
  evidence: DuplicateSoqlInsightEvidence;
  onSelectTimelineEntry: (entryId: number) => void;
}) {
  const executionEntries = evidence.executionEntryIds
    .map((entryId) => entriesById.get(entryId))
    .filter((entry): entry is ApexLogEntry => Boolean(entry));

  return (
    <div className="insight-detail-grid">
      <section>
        <h4>Repeated Query</h4>
        <dl className="insight-facts">
          <div>
            <dt>Executions</dt>
            <dd>{evidence.count}</dd>
          </div>
          {typeof evidence.totalDuration === 'number' && (
            <div>
              <dt>Total Time</dt>
              <dd>{evidence.totalDuration} ms</dd>
            </div>
          )}
          {typeof evidence.totalRows === 'number' && (
            <div>
              <dt>Total Rows</dt>
              <dd>{evidence.totalRows}</dd>
            </div>
          )}
        </dl>
      </section>

      <section>
        <h4>Query</h4>
        <p className="muted">{evidence.query}</p>
      </section>

      <section>
        <h4>Executions</h4>
        <EntryButtonList
          entries={executionEntries}
          fallback="No query execution entries found."
          onSelectTimelineEntry={onSelectTimelineEntry}
        />
      </section>
    </div>
  );
}

function PerformanceInsightDetails({
  entriesById,
  evidence,
  onSelectTimelineEntry,
}: {
  entriesById: Map<number, ApexLogEntry>;
  evidence: PerformanceInsightEvidence;
  onSelectTimelineEntry: (entryId: number) => void;
}) {
  const entry = entriesById.get(evidence.entryId);

  return (
    <div className="insight-detail-grid">
      <section>
        <h4>Performance Threshold</h4>
        <dl className="insight-facts">
          <div>
            <dt>Type</dt>
            <dd>{formatPerformanceCategory(evidence.category)}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{formatMilliseconds(evidence.duration)}</dd>
          </div>
          <div>
            <dt>Threshold</dt>
            <dd>{formatMilliseconds(evidence.threshold)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h4>Entry</h4>
        <EntryButtonList
          entries={entry ? [entry] : []}
          fallback="No performance entry details found."
          onSelectTimelineEntry={onSelectTimelineEntry}
        />
      </section>
    </div>
  );
}

function EntryButtonList({
  className,
  entries,
  fallback,
  onSelectTimelineEntry,
}: {
  className?: string;
  entries: ApexLogEntry[];
  fallback: string;
  onSelectTimelineEntry: (entryId: number) => void;
}) {
  if (entries.length === 0) {
    return <p className="muted">{fallback}</p>;
  }
  const entryGroups = groupEntriesByLabel(entries);

  return (
    <ol className={`insight-entry-list${className ? ` ${className}` : ''}`}>
      {entryGroups.map((group) => (
        <li key={group.entries[0].id}>
          <button
            className="insight-entry-button"
            onClick={() => onSelectTimelineEntry(group.entries[0].id)}
            type="button"
          >
            <span>{group.label}</span>
            <small>{formatEntryGroupLineLabel(group.entries)}</small>
          </button>
        </li>
      ))}
    </ol>
  );
}

function groupEntriesByLabel(entries: ApexLogEntry[]): {
  entries: ApexLogEntry[];
  label: string;
}[] {
  const groups = new Map<string, { entries: ApexLogEntry[]; label: string }>();

  entries.forEach((entry) => {
    const label = getEntryLabel(entry);
    const key = `${entry.type}:${label}`;
    const group = groups.get(key);

    if (group) {
      group.entries.push(entry);
      return;
    }

    groups.set(key, { entries: [entry], label });
  });

  return Array.from(groups.values());
}

function formatEntryGroupLineLabel(entries: ApexLogEntry[]): string {
  if (entries.length === 1) {
    return `Line ${entries[0].lineNumber}`;
  }

  const lineNumbers = entries.map((entry) => entry.lineNumber);
  const visibleLineNumbers = lineNumbers.slice(0, 3).join(', ');
  const overflowCount = lineNumbers.length - 3;
  const lineLabel =
    overflowCount > 0
      ? `Lines ${visibleLineNumbers} +${overflowCount}`
      : `Lines ${visibleLineNumbers}`;

  return `${entries.length} occurrences - ${lineLabel}`;
}

function getEntryLabel(entry: ApexLogEntry): string {
  if (entry.type === 'dml') {
    const operation = entry.metadata?.dml?.operation ?? 'DML';
    const object = entry.metadata?.dml?.object;

    return object ? `${operation} ${object}` : operation;
  }

  if (entry.metadata?.flow?.elementName) {
    return [entry.metadata.flow.elementType, entry.metadata.flow.elementName]
      .filter(Boolean)
      .join(' ');
  }

  if (entry.metadata?.flow?.flowName) {
    return entry.metadata.flow.flowName;
  }

  return entry.detail || entry.event;
}

function isRecursionInsightEvidence(
  evidence: ProfileInsightEvidence | undefined
): evidence is RecursionInsightEvidence {
  return Boolean(evidence && 'context' in evidence);
}

function isDuplicateSoqlInsightEvidence(
  evidence: ProfileInsightEvidence | undefined
): evidence is DuplicateSoqlInsightEvidence {
  return Boolean(evidence && 'executionEntryIds' in evidence);
}

function isPerformanceInsightEvidence(
  evidence: ProfileInsightEvidence | undefined
): evidence is PerformanceInsightEvidence {
  return Boolean(evidence && 'duration' in evidence && 'threshold' in evidence);
}

function formatPerformanceCategory(
  category: PerformanceInsightEvidence['category']
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

function formatMilliseconds(milliseconds: number): string {
  return `${milliseconds.toLocaleString()} ms`;
}

function getRecursionCycleSteps(summary: string, fallbackLabel: string): string[] {
  const cycleSummary = summary.includes(':')
    ? summary.slice(summary.indexOf(':') + 1)
    : summary;
  const steps = cycleSummary
    .replace(/\.$/, '')
    .split(/\s+->\s+/)
    .map((step) => step.trim())
    .filter(Boolean);

  return steps.length > 0 ? steps : [fallbackLabel];
}
