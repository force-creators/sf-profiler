import { useEffect, useRef } from 'react';
import type { ApexLogEntry } from '@sfdc-profiler/core';

export function EventList({
  entries,
  onSelectTimelineEntry,
  selectedEntryId,
}: {
  entries: ApexLogEntry[];
  onSelectTimelineEntry: (entryId: number) => void;
  selectedEntryId?: number;
}) {
  const selectedItemRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    selectedItemRef.current?.focus({ preventScroll: true });
  }, [selectedEntryId]);

  if (entries.length === 0) {
    return <p className="muted">No timed events found yet.</p>;
  }

  return (
    <ol className="event-list dml-execution-list">
      {entries.map((entry) => (
        <li
          className={
            entry.id === selectedEntryId
              ? 'event-list-item dml-execution-item limit-execution-item-selected'
              : 'event-list-item dml-execution-item'
          }
          key={entry.id}
          onClick={() => onSelectTimelineEntry(entry.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectTimelineEntry(entry.id);
            }
          }}
          ref={entry.id === selectedEntryId ? selectedItemRef : undefined}
          role="button"
          tabIndex={0}
        >
          <header className="dml-execution-header">
            <div>
              <strong title={entry.detail || entry.event}>
                {entry.detail || entry.event}
              </strong>
              <span>Log line {entry.lineNumber}</span>
            </div>
            <div className="soql-query-actions">
              <span className="soql-query-badge">{entry.duration ?? 0} ms</span>
            </div>
          </header>
        </li>
      ))}
    </ol>
  );
}
