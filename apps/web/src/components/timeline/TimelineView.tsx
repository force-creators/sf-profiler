import {
  ChevronDown,
  ChevronRight,
  FileText,
  Maximize2,
  Minimize2,
  Rows3,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataSet } from 'vis-data';
import {
  Timeline,
  type DataGroup,
  type DataItem,
  type TimelineOptions,
} from 'vis-timeline/standalone';
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import type {
  ApexLogEntry,
  ApexLogProfile,
  AutomationMetrics,
  FlowLimitUsage,
  FlowLimitUsageMetrics,
  LimitUsageSnapshot,
} from '@sfdc-profiler/core';
import {
  getTimelineFlowRole,
  getTimedEntries,
  getTimelineGroupIds,
  isApexDmlEntry,
  isApexSoqlEntry,
  isFlowDmlEntry,
  isFlowSoqlEntry,
  isFlowSoqlExecutionEntry,
  type TimelineFlowRole,
} from './timelineEntries';
import {
  findNearestFlowElement,
  findNearestFlowName,
  formatTimelineContent,
  formatTimelineTitle,
} from './timelineFormatting';
import { timelineGroups, type TimelineGroupId } from './timelineGroups';

type TimelineItemId = number | string;

export function TimelineView({
  isExpanded = false,
  isActive,
  onCollapseChange,
  onExpandedChange,
  onJumpToRawLogLine,
  onOpenAutomation,
  onShowInLimits,
  profile,
  selectedEntryId,
}: {
  isExpanded?: boolean;
  isActive: boolean;
  onCollapseChange?: (isCollapsed: boolean) => void;
  onExpandedChange?: (isExpanded: boolean) => void;
  onJumpToRawLogLine: (lineNumber: number) => void;
  onOpenAutomation: (unitId: string) => void;
  onShowInLimits: (entryId: number) => void;
  profile: ApexLogProfile;
  selectedEntryId?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ApexLogEntry>();
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(false);
  const [isTimelineRendering, setIsTimelineRendering] = useState(true);
  const [renderedTimelineProfile, setRenderedTimelineProfile] =
    useState<ApexLogProfile | null>(null);
  const timedEntries = useMemo(() => getTimedEntries(profile), [profile]);
  const entriesById = useMemo(
    () => new Map(profile.entries.map((entry) => [entry.id, entry])),
    [profile]
  );
  const isTimelineRenderPending =
    isTimelineRendering || renderedTimelineProfile !== profile;
  const refreshTimelineView = useCallback(() => {
    timelineRef.current?.redraw();
    timelineRef.current?.fit({ animation: false });
  }, []);

  useEffect(() => {
    onCollapseChange?.(isTimelineCollapsed);
  }, [isTimelineCollapsed, onCollapseChange]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    setSelectedEntry(undefined);
    setIsTimelineRendering(true);
    setRenderedTimelineProfile(null);
    timelineRef.current?.destroy();
    timelineRef.current = null;

    if (timedEntries.length === 0) {
      setIsTimelineRendering(false);
      setRenderedTimelineProfile(profile);
      return undefined;
    }

    let frameId: number | undefined;
    let timeoutId: number | undefined;
    let timeline: Timeline | null = null;

    function renderTimeline() {
      if (!containerRef.current) {
        return;
      }

      const itemById = new Map<TimelineItemId, ApexLogEntry>();
      const groups = new DataSet<DataGroup>(
        timelineGroups.filter((group) =>
          timedEntries.some((entry) =>
            getTimelineGroupIds(entry, entriesById).includes(group.id)
          )
        )
      );
      const items = new DataSet<DataItem>(
        timedEntries.flatMap((entry) => {
          itemById.set(entry.id, entry);
          const flowRole = getTimelineFlowRole(entry, entriesById);

          const primaryItem: DataItem = {
            id: entry.id,
            className: getTimelineItemClassName(entry, entriesById, entry.type, flowRole),
            content: formatTimelineContent(entry),
            end: entry.endTime,
            group: entry.type,
            start: entry.time,
            title: formatTimelineTitle(entry, {
              entriesById,
              includeFlowPath: true,
            }),
            type: 'range',
          };

          const flowDataItems: DataItem[] = [];

          if (isFlowDmlEntry(entry)) {
            flowDataItems.push({
              ...primaryItem,
              className: getTimelineItemClassName(entry, entriesById, 'dml'),
              content: formatTimelineContent(entry, {
                entriesById,
                flowDmlCopy: true,
              }),
              end: getTimelineVisualEnd(entry),
              group: 'dml' satisfies TimelineGroupId,
              title: formatTimelineTitle(entry, {
                entriesById,
                flowDmlCopy: true,
                includeFlowPath: true,
              }),
            });

            flowDataItems.push({
              ...primaryItem,
              id: `flow-workflow-dml-${entry.id}`,
              className: `${getTimelineItemClassName(
                entry,
                entriesById,
                'workflow',
                flowRole
              )} timeline-item-dml-mirror`,
              content: formatTimelineContent(entry, {
                entriesById,
                flowDmlCopy: true,
                flowElementOnly: true,
              }),
              end: getTimelineVisualEnd(entry),
              group: 'workflow' satisfies TimelineGroupId,
              title: formatTimelineTitle(entry, {
                entriesById,
                flowDmlCopy: true,
                flowElementOnly: true,
                includeFlowPath: true,
              }),
            });
            itemById.set(`flow-workflow-dml-${entry.id}`, entry);
          }

          if (isFlowSoqlEntry(entry)) {
            flowDataItems.push({
              ...primaryItem,
              id: `flow-soql-${entry.id}`,
              className: getTimelineItemClassName(entry, entriesById, 'soql'),
              content: formatTimelineContent(entry, {
                entriesById,
                flowSoqlCopy: true,
              }),
              end: getTimelineVisualEnd(entry),
              group: 'soql' satisfies TimelineGroupId,
              title: formatTimelineTitle(entry, {
                entriesById,
                flowSoqlCopy: true,
                includeFlowPath: true,
              }),
            });
            itemById.set(`flow-soql-${entry.id}`, entry);

            flowDataItems.push({
              ...primaryItem,
              id: `flow-workflow-soql-${entry.id}`,
              className: `${getTimelineItemClassName(
                entry,
                entriesById,
                'workflow',
                flowRole
              )} timeline-item-soql-mirror`,
              content: formatTimelineContent(entry, {
                entriesById,
                flowElementOnly: true,
                flowSoqlCopy: true,
              }),
              end: getTimelineVisualEnd(entry),
              group: 'workflow' satisfies TimelineGroupId,
              title: formatTimelineTitle(entry, {
                entriesById,
                flowElementOnly: true,
                flowSoqlCopy: true,
                includeFlowPath: true,
              }),
            });
            itemById.set(`flow-workflow-soql-${entry.id}`, entry);
          }

          const flowSoqlExecutionItem: DataItem | undefined =
            isFlowSoqlExecutionEntry(entry, entriesById)
              ? {
                  ...primaryItem,
                  id: `flow-workflow-soql-${entry.id}`,
                  className: `${getTimelineItemClassName(
                    entry,
                    entriesById,
                    'workflow',
                    flowRole
                  )} timeline-item-soql-mirror`,
                  content: formatTimelineContent(entry, {
                    entriesById,
                    flowElementOnly: true,
                    flowSoqlCopy: true,
                  }),
                  end: getTimelineVisualEnd(entry),
                  group: 'workflow' satisfies TimelineGroupId,
                  title: formatTimelineTitle(entry, {
                    entriesById,
                    flowElementOnly: true,
                    flowSoqlCopy: true,
                    includeFlowPath: true,
                  }),
                }
              : undefined;

          if (flowSoqlExecutionItem) {
            itemById.set(`flow-workflow-soql-${entry.id}`, entry);
          }

          const apexDataItem: DataItem | undefined =
            isApexDmlEntry(entry, entriesById) || isApexSoqlEntry(entry, entriesById)
            ? {
                ...primaryItem,
                id: `apex-data-${entry.id}`,
                className: `${getTimelineItemClassName(
                  entry,
                  entriesById,
                  'apex'
                )}${entry.type === 'dml' ? ' timeline-item-dml-mirror' : ''}${
                  entry.type === 'soql' ? ' timeline-item-soql-mirror' : ''
                }`,
                group: 'apex' satisfies TimelineGroupId,
                title: formatTimelineTitle(entry, {
                  entriesById,
                  includeFlowPath: true,
                }),
              }
            : undefined;

          if (apexDataItem) {
            itemById.set(`apex-data-${entry.id}`, entry);
          }

          const mirroredItems = [
            ...flowDataItems,
            ...(flowSoqlExecutionItem ? [flowSoqlExecutionItem] : []),
            ...(apexDataItem ? [apexDataItem] : []),
          ];

          if (flowDataItems.length > 0) {
            return mirroredItems;
          }

          return mirroredItems.length > 0
            ? [primaryItem, ...mirroredItems]
            : [primaryItem];
        })
      );
      const options: TimelineOptions = {
        autoResize: true,
        clickToUse: false,
        end: Math.max(profile.executionTime, 1),
        format: {
          majorLabels: () => '',
          minorLabels: (date) => `${date.valueOf()} ms`,
        },
        height: '100%',
        horizontalScroll: true,
        margin: {
          axis: 12,
          item: {
            horizontal: 0,
            vertical: 6,
          },
        },
        max: Math.max(profile.executionTime * 1.05, 1),
        min: 0,
        moveable: true,
        multiselect: false,
        orientation: {
          axis: 'top',
          item: 'top',
        },
        selectable: true,
        showCurrentTime: false,
        stack: true,
        start: 0,
        verticalScroll: true,
        zoomable: true,
        zoomKey: 'ctrlKey',
      };

      timeline = new Timeline(containerRef.current, items, groups, options);
      timeline.on(
        'select',
        ({ items: selectedItems }: { items: TimelineItemId[] }) => {
        setSelectedEntry(itemById.get(selectedItems[0]));
        }
      );
      timelineRef.current = timeline;
      timeline.fit({ animation: false });
      setRenderedTimelineProfile(profile);
      setIsTimelineRendering(false);
    }

    frameId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(renderTimeline, 0);
    });

    return () => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      timeline?.destroy();
      if (timelineRef.current === timeline) {
        timelineRef.current = null;
      }
    };
  }, [entriesById, profile, timedEntries]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      refreshTimelineView();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isActive, refreshTimelineView]);

  useEffect(() => {
    if (!isActive || isTimelineCollapsed) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      refreshTimelineView();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isActive, isExpanded, isTimelineCollapsed, refreshTimelineView]);

  useEffect(() => {
    if (!isActive || isTimelineCollapsed || isTimelineRenderPending) {
      return undefined;
    }

    const frameIds: number[] = [];
    const timeoutIds: number[] = [];
    const scheduleRefreshFrame = () => {
      const frameId = window.requestAnimationFrame(refreshTimelineView);
      frameIds.push(frameId);
    };

    scheduleRefreshFrame();
    const secondFrameId = window.requestAnimationFrame(scheduleRefreshFrame);
    frameIds.push(secondFrameId);

    [50, 150, 400].forEach((delay) => {
      const timeoutId = window.setTimeout(scheduleRefreshFrame, delay);
      timeoutIds.push(timeoutId);
    });

    return () => {
      frameIds.forEach((frameId) => window.cancelAnimationFrame(frameId));
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [
    isActive,
    isTimelineCollapsed,
    isTimelineRenderPending,
    refreshTimelineView,
  ]);

  useEffect(() => {
    if (
      !isActive ||
      isTimelineCollapsed ||
      isTimelineRenderPending ||
      !containerRef.current
    ) {
      return undefined;
    }

    let frameId: number | undefined;
    const resizeObserver = new ResizeObserver(() => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(refreshTimelineView);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();

      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [
    isActive,
    isTimelineCollapsed,
    isTimelineRenderPending,
    refreshTimelineView,
  ]);

  useEffect(() => {
    if (
      !isActive ||
      isTimelineRenderPending ||
      selectedEntryId === undefined ||
      !timelineRef.current
    ) {
      return;
    }

    const selectedEntry = timedEntries.find(
      (entry) => entry.id === selectedEntryId
    );

    if (!selectedEntry) {
      return;
    }

    setSelectedEntry(selectedEntry);
    timelineRef.current.setSelection([selectedEntryId], {
      animation: { animation: false },
      focus: true,
    });
  }, [isActive, isTimelineRenderPending, selectedEntryId, timedEntries]);

  if (timedEntries.length === 0) {
    return (
      <section className="panel">
        <div className="panel-title">
          <Rows3 size={18} aria-hidden="true" />
          <h3>Timeline</h3>
        </div>
        <p className="muted">No timed events longer than 1 ms were found in this log.</p>
      </section>
    );
  }

  const hasSelection = Boolean(selectedEntry);
  const selectedFlowName = selectedEntry
    ? findNearestFlowName(selectedEntry, entriesById)
    : undefined;
  const selectedFlowElement = selectedEntry
    ? findNearestFlowElement(selectedEntry, entriesById)
    : undefined;
  const selectedFlowElementName =
    selectedEntry?.metadata?.flow?.elementName ?? selectedFlowElement?.name;
  const selectedFlowElementType =
    selectedEntry?.metadata?.flow?.elementType ?? selectedFlowElement?.type;
  const selectedFlowDataLabels = selectedEntry
    ? getFlowDataLabels(selectedEntry)
    : [];
  const selectedFlowLimitRows = selectedEntry
    ? getFlowLimitUsageRows(selectedEntry.metadata?.flow?.usage)
    : [];
  const selectedCodeUnitLimitRows = selectedEntry
    ? getCodeUnitLimitRows(selectedEntry, profile)
    : [];
  const selectedDatabaseLimitRows = selectedEntry
    ? getDatabaseLimitUsageRows(selectedEntry, profile)
    : [];
  const selectedLimitRows = [
    ...selectedFlowLimitRows,
    ...selectedCodeUnitLimitRows,
    ...selectedDatabaseLimitRows,
  ];
  const selectedAutomationUnitId = selectedEntry
    ? getAutomationUnitIdForEntry(selectedEntry, profile)
    : undefined;

  function clearSelection() {
    setSelectedEntry(undefined);
    timelineRef.current?.setSelection([]);
  }

  return (
    <div
      className={
        hasSelection && !isTimelineCollapsed
          ? 'timeline-layout timeline-layout-with-selection'
          : isTimelineCollapsed
            ? 'timeline-layout timeline-layout-collapsed'
            : 'timeline-layout'
      }
    >
      <section
        className={`panel timeline-panel${
          isTimelineCollapsed ? ' timeline-panel-collapsed' : ''
        }`}
      >
        <div className="panel-title">
          <Rows3 size={18} aria-hidden="true" />
          <h3>Timeline</h3>
          <div className="timeline-panel-actions">
            {!isTimelineCollapsed && onExpandedChange && (
              <button
                aria-label={
                  isExpanded
                    ? 'Restore Summary Panels'
                    : 'Expand Timeline to top of Summary'
                }
                aria-pressed={isExpanded}
                className="panel-collapse-toggle"
                onClick={() => onExpandedChange(!isExpanded)}
                title={
                  isExpanded
                    ? 'Restore summary panels'
                    : 'Expand timeline to top of summary'
                }
                type="button"
              >
                {isExpanded ? (
                  <Minimize2 size={16} aria-hidden="true" />
                ) : (
                  <Maximize2 size={16} aria-hidden="true" />
                )}
              </button>
            )}
            <button
              aria-expanded={!isTimelineCollapsed}
              aria-label={
                isTimelineCollapsed ? 'Expand Timeline' : 'Collapse Timeline'
              }
              className="panel-collapse-toggle"
              onClick={() => setIsTimelineCollapsed((collapsed) => !collapsed)}
              title={isTimelineCollapsed ? 'Expand timeline' : 'Collapse timeline'}
              type="button"
            >
              {isTimelineCollapsed ? (
                <ChevronRight size={16} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        <div
          className={`timeline-stage-frame${
            isTimelineCollapsed ? ' timeline-stage-collapsed' : ''
          }`}
        >
          <div
            aria-busy={isTimelineRenderPending}
            className="timeline-stage"
            ref={containerRef}
          />
          {isTimelineRenderPending && !isTimelineCollapsed && (
            <div
              aria-live="polite"
              className="timeline-rendering-overlay"
              role="status"
            >
              <span className="timeline-rendering-spinner" aria-hidden="true" />
              <span>Rendering timeline...</span>
            </div>
          )}
        </div>
      </section>

      {hasSelection && selectedEntry && !isTimelineCollapsed && (
        <section className="panel timeline-detail">
          <div className="panel-title timeline-detail-title">
            <div className="timeline-detail-title-label">
              <FileText size={18} aria-hidden="true" />
              <h3>{selectedEntry.event || 'Selection'}</h3>
            </div>
            <button
              aria-label="Close timeline selection details"
              className="timeline-detail-close"
              onClick={clearSelection}
              type="button"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <>
            <dl>
              <div>
                <dt>Detail</dt>
                <dd>{selectedEntry.detail || selectedEntry.type}</dd>
              </div>
              {selectedFlowName && (
                <div>
                  <dt>Flow</dt>
                  <dd>{selectedFlowName}</dd>
                </div>
              )}
              {selectedFlowElementName && (
                <div>
                  <dt>Flow Element</dt>
                  <dd>{selectedFlowElementName}</dd>
                </div>
              )}
              {selectedFlowElementType && (
                <div>
                  <dt>Flow Element Type</dt>
                  <dd>{selectedFlowElementType}</dd>
                </div>
              )}
              {selectedFlowDataLabels.length > 0 && (
                <div>
                  <dt>Flow Data</dt>
                  <dd>{selectedFlowDataLabels.join(', ')}</dd>
                </div>
              )}
              {selectedLimitRows.length > 0 && (
                <div>
                  <dt>Limits Consumed</dt>
                  <dd>
                    <ul className="timeline-detail-metrics">
                      {selectedLimitRows.map((row) => (
                        <li key={row.label}>
                          <span>{row.label}</span>
                          <span>{row.value}</span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
              <div>
                <dt>Time</dt>
                <dd>
                  {selectedEntry.time} ms - {selectedEntry.endTime} ms
                </dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{selectedEntry.duration} ms</dd>
              </div>
              <div>
                <dt>Line</dt>
                <dd>{selectedEntry.lineNumber}</dd>
              </div>
            </dl>
            <div className="timeline-detail-actions">
              <button
                className="timeline-detail-action timeline-detail-action-secondary"
                onClick={() => onJumpToRawLogLine(selectedEntry.lineNumber)}
                type="button"
              >
                Jump to Raw Log Line {selectedEntry.lineNumber}
              </button>
              {selectedAutomationUnitId && (
                <button
                  className="timeline-detail-action timeline-detail-action-secondary"
                  onClick={() => onOpenAutomation(selectedAutomationUnitId)}
                  type="button"
                >
                  Open Automation
                </button>
              )}
              {(selectedEntry.type === 'soql' || selectedEntry.type === 'dml') && (
                <button
                className="timeline-detail-action"
                onClick={() => onShowInLimits(selectedEntry.id)}
                type="button"
              >
                Show in Limits
              </button>
              )}
            </div>
          </>
        </section>
      )}
    </div>
  );
}

function getFlowDataLabels(entry: ApexLogEntry): string[] {
  return (entry.metadata?.flow?.dataOperations ?? []).map((operation) =>
    operation === 'soql' ? 'SOQL Query' : 'DML'
  );
}

function getAutomationUnitIdForEntry(
  entry: ApexLogEntry,
  profile: ApexLogProfile
): string | undefined {
  if (isFlowCodeUnitEntry(entry)) {
    return undefined;
  }

  const element = profile.automation.elements.find((candidate) =>
    candidate.entryIds.includes(entry.id)
  );

  if (element) {
    return element.unitId;
  }

  const startedExecution = profile.automation.executions.find(
    (candidate) =>
      candidate.startEntryId === entry.id &&
      candidate.startLineNumber === entry.lineNumber
  );

  if (startedExecution) {
    return startedExecution.unitId;
  }

  const soqlExecutionId = profile.soqlExecutions.find(
    (candidate) => candidate.entryId === entry.id
  )?.id;
  const dmlExecutionId = profile.dmlExecutions.find(
    (candidate) => candidate.entryId === entry.id
  )?.id;
  const databaseExecution = profile.automation.executions.find(
    (candidate) =>
      (soqlExecutionId !== undefined &&
        candidate.soqlExecutionIds.includes(soqlExecutionId)) ||
      (dmlExecutionId !== undefined &&
        candidate.dmlExecutionIds.includes(dmlExecutionId))
  );

  if (databaseExecution) {
    return databaseExecution.unitId;
  }

  const execution = profile.automation.executions.find(
    (candidate) =>
      (candidate.endEntryId === entry.id &&
        candidate.endLineNumber === entry.lineNumber) ||
      candidate.entryIds.includes(entry.id)
  );

  if (execution) {
    return execution.unitId;
  }

  return profile.automation.units.find((candidate) =>
    candidate.entryIds.includes(entry.id)
  )?.id;
}

function getFlowLimitUsageRows(
  usage: FlowLimitUsageMetrics | undefined
): Array<{ label: string; value: string }> {
  if (!usage) {
    return [];
  }

  const rows: Array<[string, FlowLimitUsage | undefined]> = [
    ['SOQL Queries', usage.soqlQueries],
    ['SOQL Rows', usage.soqlRows],
    ['DML Statements', usage.dmlStatements],
    ['DML Rows', usage.dmlRows],
    ['CPU Time', usage.cpuMs],
  ];

  return rows.flatMap(([label, limitUsage]) => {
    if (!limitUsage) {
      return [];
    }

    const unit = label === 'CPU Time' ? ' ms' : '';

    return [
      {
        label,
        value: `${limitUsage.consumed.toLocaleString()}${unit} (${limitUsage.current.toLocaleString()} / ${limitUsage.max.toLocaleString()})`,
      },
    ];
  });
}

function getCodeUnitLimitRows(
  entry: ApexLogEntry,
  profile: ApexLogProfile
): Array<{ label: string; value: string }> {
  if (!isCodeUnitDetailEntry(entry)) {
    return [];
  }

  const executions = findCodeUnitExecutions(entry, profile);

  if (executions.length === 0) {
    return [];
  }

  return getAutomationMetricRows(aggregateAutomationMetrics(executions));
}

function isCodeUnitDetailEntry(entry: ApexLogEntry): boolean {
  if (
    entry.metadata?.flow?.elementName ||
    entry.type === 'dml' ||
    entry.type === 'soql'
  ) {
    return false;
  }

  return (
    entry.event === 'CODE_UNIT_STARTED' ||
    entry.event === 'CODE_UNIT_FINISHED' ||
    entry.event === 'FLOW_CREATE_INTERVIEW_END' ||
    entry.event === 'FLOW_START_INTERVIEW_BEGIN' ||
    entry.event === 'FLOW_START_INTERVIEW_END' ||
    entry.event === 'FLOW_INTERVIEW_FINISHED'
  );
}

function findCodeUnitExecutions(
  entry: ApexLogEntry,
  profile: ApexLogProfile
): Array<ApexLogProfile['automation']['executions'][number]> {
  const directExecution = profile.automation.executions.find(
    (candidate) =>
      candidate.startEntryId === entry.id ||
      candidate.endEntryId === entry.id ||
      candidate.entryIds.includes(entry.id)
  );

  if (directExecution && !isFlowCodeUnitEntry(entry)) {
    return [directExecution];
  }

  if (!isFlowCodeUnitEntry(entry)) {
    return directExecution ? [directExecution] : [];
  }

  const flowUnit = profile.automation.units.find(
    (unit) => unit.kind === 'flow' && unit.codeUnit === entry.detail
  );

  if (!flowUnit) {
    return directExecution ? [directExecution] : [];
  }

  const executionsInsideCodeUnit = profile.automation.executions.filter((execution) =>
    flowUnit.executionIds.includes(execution.id) &&
    isExecutionInsideCodeUnit(entry, execution)
  );

  if (executionsInsideCodeUnit.length > 0) {
    return executionsInsideCodeUnit;
  }

  return directExecution ? [directExecution] : [];
}

function isFlowCodeUnitEntry(entry: ApexLogEntry): boolean {
  return (
    (entry.event === 'CODE_UNIT_STARTED' || entry.event === 'CODE_UNIT_FINISHED') &&
    entry.detail.startsWith('Flow:')
  );
}

function isExecutionInsideCodeUnit(
  entry: ApexLogEntry,
  execution: ApexLogProfile['automation']['executions'][number]
): boolean {
  if (typeof execution.startLineNumber !== 'number') {
    return false;
  }

  if (execution.startLineNumber < entry.lineNumber) {
    return false;
  }

  if (
    typeof entry.endLineNumber === 'number' &&
    typeof execution.endLineNumber === 'number' &&
    execution.endLineNumber > entry.endLineNumber
  ) {
    return false;
  }

  if (
    typeof entry.endLineNumber === 'number' &&
    typeof execution.endLineNumber !== 'number'
  ) {
    return execution.startLineNumber <= entry.endLineNumber;
  }

  return true;
}

function aggregateAutomationMetrics(
  executions: Array<ApexLogProfile['automation']['executions'][number]>
): AutomationMetrics {
  const totals: Record<keyof AutomationMetrics, number> = {
    durationMs: 0,
    cpuMs: 0,
    soqlQueries: 0,
    soqlRows: 0,
    dmlStatements: 0,
    dmlRows: 0,
  };

  for (const execution of executions) {
    for (const key of Object.keys(totals) as Array<keyof AutomationMetrics>) {
      totals[key] += execution.metrics[key]?.value ?? 0;
    }
  }

  return Object.fromEntries(
    (Object.entries(totals) as Array<[keyof AutomationMetrics, number]>)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => [key, { value, confidence: 'inferred' }])
  ) as AutomationMetrics;
}

function getAutomationMetricRows(
  metrics: AutomationMetrics
): Array<{ label: string; value: string }> {
  const rows: Array<[string, number | undefined, string?]> = [
    ['SOQL Queries', metrics.soqlQueries?.value],
    ['SOQL Rows', metrics.soqlRows?.value],
    ['DML Statements', metrics.dmlStatements?.value],
    ['DML Rows', metrics.dmlRows?.value],
    ['CPU Time', metrics.cpuMs?.value, ' ms'],
  ];

  return rows.flatMap(([label, value, unit = '']) => {
    if (typeof value !== 'number' || value === 0) {
      return [];
    }

    return [
      {
        label,
        value: `${value.toLocaleString()}${unit}`,
      },
    ];
  });
}

function getDatabaseLimitUsageRows(
  entry: ApexLogEntry,
  profile: ApexLogProfile
): Array<{ label: string; value: string }> {
  if (entry.type === 'dml') {
    return getDmlLimitUsageRows(entry, profile);
  }

  if (entry.type === 'soql') {
    return getSoqlLimitUsageRows(entry, profile);
  }

  return [];
}

function getDmlLimitUsageRows(
  entry: ApexLogEntry,
  profile: ApexLogProfile
): Array<{ label: string; value: string }> {
  const execution = profile.dmlExecutions.find(
    (candidate) => candidate.entryId === entry.id
  );
  const usage = execution?.usage ?? entry.metadata?.dml?.usage;
  const rows: Array<{ label: string; value: string }> = [];

  if (usage?.statements) {
    rows.push({
      label: 'DML Statements',
      value: formatLimitUsage(1, usage.statements),
    });
  }

  const consumedRows = execution?.rows ?? entry.metadata?.dml?.rows;

  if (typeof consumedRows === 'number') {
    rows.push({
      label: 'DML Rows',
      value: formatLimitUsage(consumedRows, usage?.rows),
    });
  }

  return rows;
}

function getSoqlLimitUsageRows(
  entry: ApexLogEntry,
  profile: ApexLogProfile
): Array<{ label: string; value: string }> {
  const execution = profile.soqlExecutions.find(
    (candidate) => candidate.entryId === entry.id
  );
  const usage = execution?.usage ?? entry.metadata?.soql?.usage;
  const rows: Array<{ label: string; value: string }> = [];

  if (usage?.queries) {
    rows.push({
      label: 'SOQL Queries',
      value: formatLimitUsage(1, usage.queries),
    });
  }

  const consumedRows = execution?.rows ?? entry.metadata?.soql?.rows;

  if (typeof consumedRows === 'number') {
    rows.push({
      label: 'SOQL Rows',
      value: formatLimitUsage(consumedRows, usage?.rows),
    });
  }

  const aggregations =
    execution?.aggregations ?? entry.metadata?.soql?.aggregations;

  if (typeof aggregations === 'number' && aggregations > 0) {
    rows.push({
      label: 'Aggregations',
      value: formatLimitUsage(aggregations, usage?.aggregations),
    });
  }

  return rows;
}

function formatLimitUsage(
  consumed: number,
  usage: LimitUsageSnapshot | undefined
): string {
  if (!usage) {
    return consumed.toLocaleString();
  }

  return `${consumed.toLocaleString()} (${usage.current.toLocaleString()} / ${usage.max.toLocaleString()})`;
}

function getTimelineItemClassName(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>,
  groupId: TimelineGroupId,
  flowRole?: TimelineFlowRole
): string {
  const classNames = [`timeline-item-${groupId}`];
  const nestingDepth = getTimelineNestingDepth(entry, entriesById, groupId);

  if (nestingDepth > 0) {
    classNames.push(
      'timeline-lane-nested',
      `timeline-lane-depth-${Math.min(nestingDepth, 3)}`
    );
  }

  if (flowRole) {
    classNames.push(
      `timeline-flow-${flowRole.kind}`,
      `timeline-depth-${Math.min(flowRole.depth, 3)}`
    );

    if (flowRole.isInvoked) {
      classNames.push('timeline-flow-invoked');
    }
  }

  return classNames.join(' ');
}

function getTimelineVisualEnd(entry: ApexLogEntry): number {
  return Math.max(entry.endTime ?? entry.time, entry.time + 1);
}

function getTimelineNestingDepth(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>,
  groupId: TimelineGroupId
): number {
  if (groupId === 'workflow') {
    return 0;
  }

  let depth = 0;
  let current =
    entry.parentId === undefined ? undefined : entriesById.get(entry.parentId);

  while (current) {
    if (current.type === groupId) {
      depth += 1;
    } else if (groupId === 'dml' && current.type === 'workflow') {
      depth += 1;
    }

    current =
      current.parentId === undefined ? undefined : entriesById.get(current.parentId);
  }

  return depth;
}
