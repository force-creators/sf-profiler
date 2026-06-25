import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleX,
  Database,
  Info,
  Lightbulb,
  OctagonAlert,
  Rows3,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ProfileInsightSeverity } from '@sfdc-profiler/core';
import type { LoadedLog } from '../../types';
import { DmlExecutionList } from '../limits/dml/DmlExecutionList';
import { SoqlQueryList } from '../limits/soql/SoqlQueryList';

const SUMMARY_COLUMN_RESIZER_SIZE = 10;
const SUMMARY_SIDE_RESIZER_SIZE = 10;
const MIN_SUMMARY_LEFT_WIDTH = 300;
const MIN_SUMMARY_RIGHT_WIDTH = 320;
const MIN_SOQL_SECTION_HEIGHT = 170;
const MIN_DML_SECTION_HEIGHT = 170;

export function SummaryView({
  loadedLog,
  onOpenInsights,
  onOpenLimitsSection,
  onTopCollapseChange,
  onSelectTimelineEntry,
  selectedEntryId,
}: {
  loadedLog: LoadedLog;
  onOpenInsights: () => void;
  onOpenLimitsSection: (section: 'soql' | 'dml') => void;
  onTopCollapseChange: (isCollapsed: boolean) => void;
  onSelectTimelineEntry: (entryId: number) => void;
  selectedEntryId?: number;
}) {
  const topGridRef = useRef<HTMLDivElement | null>(null);
  const sidePanelRef = useRef<HTMLDivElement | null>(null);
  const activeResizeRef = useRef<
    'columns' | 'sideRows' | undefined
  >(undefined);
  const [leftColumnWidth, setLeftColumnWidth] = useState<number>();
  const [soqlSectionHeight, setSoqlSectionHeight] = useState<number>();
  const [isInsightsCollapsed, setIsInsightsCollapsed] = useState(false);
  const [isSoqlCollapsed, setIsSoqlCollapsed] = useState(false);
  const [isDmlCollapsed, setIsDmlCollapsed] = useState(false);
  const soqlExecutions = useMemo(
    () =>
      [...(loadedLog.profile.soqlExecutions ?? [])].sort((left, right) => {
        const duplicateDelta =
          (right.duplicateCount ?? 1) - (left.duplicateCount ?? 1);

        if (duplicateDelta !== 0) {
          return duplicateDelta;
        }

        const primaryDelta =
          Number(left.duplicateOfId !== undefined) -
          Number(right.duplicateOfId !== undefined);

        if (primaryDelta !== 0) {
          return primaryDelta;
        }

        const durationDelta = (right.duration ?? 0) - (left.duration ?? 0);

        if (durationDelta !== 0) {
          return durationDelta;
        }

        return left.lineNumber - right.lineNumber;
      }),
    [loadedLog.profile.soqlExecutions]
  );
  const dmlExecutions = loadedLog.profile.dmlExecutions ?? [];
  const insights = loadedLog.profile.insights ?? [];

  useEffect(() => {
    onTopCollapseChange(
      isInsightsCollapsed && isSoqlCollapsed && isDmlCollapsed
    );
  }, [
    isDmlCollapsed,
    isInsightsCollapsed,
    isSoqlCollapsed,
    onTopCollapseChange,
  ]);

  useEffect(() => {
    function stopResize() {
      if (!activeResizeRef.current) {
        return;
      }

      activeResizeRef.current = undefined;
      document.body.classList.remove('is-resizing-summary-panels');
      document.body.classList.remove('is-resizing-summary-columns');
      document.body.classList.remove('is-resizing-summary-rows');
    }

    function resizePanels(event: PointerEvent) {
      if (!activeResizeRef.current) {
        return;
      }

      if (activeResizeRef.current === 'columns' && topGridRef.current) {
        const rect = topGridRef.current.getBoundingClientRect();
        const maxLeftWidth = Math.max(
          MIN_SUMMARY_LEFT_WIDTH,
          rect.width - SUMMARY_COLUMN_RESIZER_SIZE - MIN_SUMMARY_RIGHT_WIDTH
        );
        const nextLeftWidth = Math.min(
          Math.max(event.clientX - rect.left, MIN_SUMMARY_LEFT_WIDTH),
          maxLeftWidth
        );

        setLeftColumnWidth(nextLeftWidth);
        return;
      }

      if (activeResizeRef.current === 'sideRows') {
        if (!sidePanelRef.current) {
          return;
        }

        const rect = sidePanelRef.current.getBoundingClientRect();
        const maxSoqlHeight = Math.max(
          MIN_SOQL_SECTION_HEIGHT,
          rect.height - SUMMARY_SIDE_RESIZER_SIZE - MIN_DML_SECTION_HEIGHT
        );
        const nextSoqlHeight = Math.min(
          Math.max(event.clientY - rect.top, MIN_SOQL_SECTION_HEIGHT),
          maxSoqlHeight
        );

        setSoqlSectionHeight(nextSoqlHeight);
      }
    }

    window.addEventListener('pointermove', resizePanels);
    window.addEventListener('pointerup', stopResize);

    return () => {
      window.removeEventListener('pointermove', resizePanels);
      window.removeEventListener('pointerup', stopResize);
      document.body.classList.remove('is-resizing-summary-panels');
      document.body.classList.remove('is-resizing-summary-columns');
      document.body.classList.remove('is-resizing-summary-rows');
    };
  }, []);

  function startColumnResize() {
    activeResizeRef.current = 'columns';
    document.body.classList.add('is-resizing-summary-panels');
    document.body.classList.add('is-resizing-summary-columns');
    document.body.classList.remove('is-resizing-summary-rows');
  }

  function startSideResize() {
    activeResizeRef.current = 'sideRows';
    document.body.classList.add('is-resizing-summary-panels');
    document.body.classList.add('is-resizing-summary-rows');
    document.body.classList.remove('is-resizing-summary-columns');
  }

  function toggleInsightsSection() {
    setIsInsightsCollapsed((collapsed) => !collapsed);
  }

  function toggleSoqlSection() {
    setIsSoqlCollapsed((collapsed) => {
      if (collapsed && !isDmlCollapsed && soqlSectionHeight === undefined) {
        setSoqlSectionHeight(MIN_SOQL_SECTION_HEIGHT);
      }

      if (!collapsed) {
        setSoqlSectionHeight(undefined);
      }

      return !collapsed;
    });
  }

  function toggleDmlSection() {
    setIsDmlCollapsed((collapsed) => {
      if (!collapsed) {
        setSoqlSectionHeight(undefined);
      }

      return !collapsed;
    });
  }

  const summaryTopGridStyle = {
    '--summary-left-column-width': leftColumnWidth
      ? `${leftColumnWidth}px`
      : undefined,
  } as CSSProperties;

  const summarySidePanelStyle = {
    '--summary-soql-height': soqlSectionHeight
      ? `${soqlSectionHeight}px`
      : undefined,
  } as CSSProperties;

  const summaryMainStackClassName = `summary-main-stack${
    isInsightsCollapsed ? ' summary-main-stack-insights-collapsed' : ''
  }`;
  const showSideResizer = !isSoqlCollapsed && !isDmlCollapsed;
  const summarySideStackClassName =
    showSideResizer
      ? 'summary-side-stack'
      : `summary-side-stack ${
          isSoqlCollapsed && isDmlCollapsed
            ? 'summary-side-stack-both-collapsed'
            : isSoqlCollapsed
              ? 'summary-side-stack-soql-collapsed'
              : 'summary-side-stack-dml-collapsed'
        }`;

  return (
    <div className="summary-top-grid" ref={topGridRef} style={summaryTopGridStyle}>
      <div className={summaryMainStackClassName}>
        <section
          className={`panel summary-insights-panel summary-main-section${
            isInsightsCollapsed ? ' summary-section-collapsed' : ''
          }`}
        >
          <div className="panel-title">
            <Lightbulb size={18} aria-hidden="true" />
            <button
              className={`summary-section-link${isInsightsCollapsed ? ' summary-section-link-collapsed' : ''}`}
              onClick={onOpenInsights}
              type="button"
            >
              Insights ({insights.length})
            </button>
            <button
              aria-expanded={!isInsightsCollapsed}
              aria-label={isInsightsCollapsed ? 'Expand Insights' : 'Collapse Insights'}
              className="panel-collapse-toggle"
              onClick={toggleInsightsSection}
              type="button"
            >
              {isInsightsCollapsed ? (
                <ChevronRight size={16} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" />
              )}
            </button>
          </div>
          {!isInsightsCollapsed && (
            <div className="summary-insights-body">
              {insights.length === 0 ? (
                <p className="muted">No insights found yet.</p>
              ) : (
                <ol className="summary-insight-list">
                  {insights.map((insight) => {
                    const SeverityIcon = getSummaryInsightSeverityIcon(
                      insight.severity
                    );

                    return (
                      <li
                        className={`summary-insight-${insight.severity}`}
                        key={insight.id}
                      >
                        <SeverityIcon size={15} aria-hidden="true" />
                        <button onClick={onOpenInsights} type="button">
                          <strong>{insight.title}</strong>
                          <span>{insight.summary}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </section>
      </div>

      <button
        aria-label="Resize summary columns"
        className="summary-column-resizer"
        onPointerDown={startColumnResize}
        type="button"
      />

      <div
        className={summarySideStackClassName}
        ref={sidePanelRef}
        style={showSideResizer ? summarySidePanelStyle : undefined}
      >
        <section
          className={`panel summary-list-section soql-section${
            isSoqlCollapsed ? ' summary-section-collapsed' : ''
          }`}
        >
          <div className="panel-title">
            <Database size={18} aria-hidden="true" />
            <button
              className={`summary-section-link${isSoqlCollapsed ? ' summary-section-link-collapsed' : ''}`}
              onClick={() => onOpenLimitsSection('soql')}
              type="button"
            >
              SOQL Queries ({soqlExecutions.length})
            </button>
            <button
              aria-expanded={!isSoqlCollapsed}
              aria-label={isSoqlCollapsed ? 'Expand SOQL Queries' : 'Collapse SOQL Queries'}
              className="panel-collapse-toggle"
              onClick={toggleSoqlSection}
              type="button"
            >
              {isSoqlCollapsed ? (
                <ChevronRight size={16} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" />
              )}
            </button>
          </div>
          {!isSoqlCollapsed && (
            <SoqlQueryList
              executions={soqlExecutions}
              onSelectTimelineEntry={onSelectTimelineEntry}
              selectedEntryId={selectedEntryId}
            />
          )}
        </section>

        {showSideResizer && (
          <button
            aria-label="Resize SOQL and DML sections"
            className="summary-side-resizer"
            onPointerDown={startSideResize}
            type="button"
          />
        )}

        <section
          className={`panel summary-list-section dml-section${
            isDmlCollapsed ? ' summary-section-collapsed' : ''
          }`}
        >
          <div className="panel-title">
            <Rows3 size={18} aria-hidden="true" />
            <button
              className={`summary-section-link${isDmlCollapsed ? ' summary-section-link-collapsed' : ''}`}
              onClick={() => onOpenLimitsSection('dml')}
              type="button"
            >
              DML Executions ({dmlExecutions.length})
            </button>
            <button
              aria-expanded={!isDmlCollapsed}
              aria-label={isDmlCollapsed ? 'Expand DML Executions' : 'Collapse DML Executions'}
              className="panel-collapse-toggle"
              onClick={toggleDmlSection}
              type="button"
            >
              {isDmlCollapsed ? (
                <ChevronRight size={16} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" />
              )}
            </button>
          </div>
          {!isDmlCollapsed && (
            <DmlExecutionList
              executions={dmlExecutions}
              onSelectTimelineEntry={onSelectTimelineEntry}
              selectedEntryId={selectedEntryId}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function getSummaryInsightSeverityIcon(
  severity: ProfileInsightSeverity
): LucideIcon {
  if (severity === 'info') {
    return Info;
  }

  if (severity === 'serious') {
    return OctagonAlert;
  }

  if (severity === 'error') {
    return CircleX;
  }

  return AlertTriangle;
}
