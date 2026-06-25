import { ChevronDown, ChevronRight, FileText, Rows3, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataSet } from 'vis-data';
import {
  Timeline,
  type DataGroup,
  type DataItem,
  type TimelineOptions,
} from 'vis-timeline/standalone';
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import type { ApexLogEntry, ApexLogProfile } from '@sfdc-profiler/core';
import { getTimedEntries } from './timelineEntries';
import { formatTimelineContent, formatTimelineTitle } from './timelineFormatting';
import { timelineGroups } from './timelineGroups';

export function TimelineView({
  isActive,
  onCollapseChange,
  onJumpToRawLogLine,
  onShowInLimits,
  profile,
  selectedEntryId,
}: {
  isActive: boolean;
  onCollapseChange?: (isCollapsed: boolean) => void;
  onJumpToRawLogLine: (lineNumber: number) => void;
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

      const itemById = new Map<number, ApexLogEntry>();
      const groups = new DataSet<DataGroup>(
        timelineGroups.filter((group) =>
          timedEntries.some((entry) => entry.type === group.id)
        )
      );
      const items = new DataSet<DataItem>(
        timedEntries.map((entry) => {
          itemById.set(entry.id, entry);

          return {
            id: entry.id,
            className: `timeline-item-${entry.type}`,
            content: formatTimelineContent(entry),
            end: entry.endTime,
            group: entry.type,
            start: entry.time,
            title: formatTimelineTitle(entry),
            type: 'range',
          };
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
      timeline.on('select', ({ items: selectedItems }: { items: number[] }) => {
        setSelectedEntry(itemById.get(selectedItems[0]));
      });
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
  }, [profile, timedEntries]);

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
  }, [isActive, isTimelineCollapsed, refreshTimelineView]);

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
          <button
            aria-expanded={!isTimelineCollapsed}
            aria-label={isTimelineCollapsed ? 'Expand Timeline' : 'Collapse Timeline'}
            className="panel-collapse-toggle"
            onClick={() => setIsTimelineCollapsed((collapsed) => !collapsed)}
            type="button"
          >
            {isTimelineCollapsed ? (
              <ChevronRight size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </button>
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
