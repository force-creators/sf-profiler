import { ChevronDown, ChevronRight, Database, Gauge, Rows3 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ApexLogEntry, ApexLogProfile } from '@sfdc-profiler/core';
import type { LoadedLog } from '../../types';
import { DmlExecutionList } from '../limits/dml/DmlExecutionList';
import { SoqlQueryList } from '../limits/soql/SoqlQueryList';
import { EventList } from './EventList';

const SUMMARY_COLUMN_RESIZER_SIZE = 10;
const SUMMARY_SIDE_RESIZER_SIZE = 10;
const MIN_SUMMARY_LEFT_WIDTH = 300;
const MIN_SUMMARY_RIGHT_WIDTH = 320;
const MIN_SOQL_SECTION_HEIGHT = 170;
const MIN_DML_SECTION_HEIGHT = 170;

export function SummaryView({
  loadedLog,
  onOpenLimitsSection,
  onTopCollapseChange,
  onSelectTimelineEntry,
  selectedEntryId,
}: {
  loadedLog: LoadedLog;
  onOpenLimitsSection: (section: 'soql' | 'dml') => void;
  onTopCollapseChange: (isCollapsed: boolean) => void;
  onSelectTimelineEntry: (entryId: number) => void;
  selectedEntryId?: number;
}) {
  const slowestEntries = findSlowestEntries(loadedLog.profile);
  const topGridRef = useRef<HTMLDivElement | null>(null);
  const sidePanelRef = useRef<HTMLDivElement | null>(null);
  const activeResizeRef = useRef<'columns' | 'side' | undefined>(undefined);
  const [leftColumnWidth, setLeftColumnWidth] = useState<number>();
  const [soqlSectionHeight, setSoqlSectionHeight] = useState<number>();
  const [isSlowestCollapsed, setIsSlowestCollapsed] = useState(false);
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

  useEffect(() => {
    onTopCollapseChange(isSlowestCollapsed && isSoqlCollapsed && isDmlCollapsed);
  }, [
    isDmlCollapsed,
    isSlowestCollapsed,
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

      if (activeResizeRef.current === 'side' && sidePanelRef.current) {
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
    activeResizeRef.current = 'side';
    document.body.classList.add('is-resizing-summary-panels');
    document.body.classList.add('is-resizing-summary-rows');
    document.body.classList.remove('is-resizing-summary-columns');
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
      <section
        className={`panel summary-slowest-panel summary-main-section${
          isSlowestCollapsed ? ' summary-section-collapsed' : ''
        }`}
      >
        <div className="panel-title">
          <Gauge size={18} aria-hidden="true" />
          <h3>Slowest Events</h3>
          <button
            aria-expanded={!isSlowestCollapsed}
            aria-label={isSlowestCollapsed ? 'Expand Slowest Events' : 'Collapse Slowest Events'}
            className="panel-collapse-toggle"
            onClick={() => setIsSlowestCollapsed((collapsed) => !collapsed)}
            type="button"
          >
            {isSlowestCollapsed ? (
              <ChevronRight size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </button>
        </div>
        {!isSlowestCollapsed && (
          <EventList
            entries={slowestEntries}
            onSelectTimelineEntry={onSelectTimelineEntry}
            selectedEntryId={selectedEntryId}
          />
        )}
      </section>

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
              onClick={() => setIsSoqlCollapsed((collapsed) => !collapsed)}
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
              onClick={() => setIsDmlCollapsed((collapsed) => !collapsed)}
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

function findSlowestEntries(profile: ApexLogProfile): ApexLogEntry[] {
  const rootIdSet = new Set(profile.rootIds);

  return profile.entries
    .filter(
      (entry): entry is ApexLogEntry =>
        Boolean(entry?.duration) &&
        !(
          (entry.parentId === undefined ||
            (entry.parentId !== undefined && rootIdSet.has(entry.parentId))) &&
          (entry.type === 'dml' || entry.type === 'other')
        )
    )
    .sort((left, right) => (right.duration ?? 0) - (left.duration ?? 0))
    .slice(0, 10);
}
