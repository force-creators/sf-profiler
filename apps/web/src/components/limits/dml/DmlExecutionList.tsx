import { useEffect, useRef } from 'react';
import type { DmlExecution } from '@sfdc-profiler/core';

export function DmlExecutionList({
  executions,
  onSelectTimelineEntry,
  selectedEntryId,
}: {
  executions: DmlExecution[];
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

  if (executions.length === 0) {
    return <p className="muted">No DML executions found in this log.</p>;
  }

  function formatTitle(execution: DmlExecution): string {
    const fullTitle = `${execution.operation ?? ''} ${execution.object ?? ''}`.trim();

    if (!fullTitle) {
      return 'DML';
    }

    const firstSpaceIndex = fullTitle.indexOf(' ');

    if (firstSpaceIndex === -1 || firstSpaceIndex === fullTitle.length - 1) {
      return fullTitle;
    }

    return fullTitle.slice(firstSpaceIndex + 1);
  }

  function formatPrimaryDetails(execution: DmlExecution): string {
    const details = [`${execution.duration ?? 0} ms`];

    if (typeof execution.rows === 'number') {
      details.push(`${execution.rows} rows`);
    }

    return details.join(', ');
  }

  function formatUsageDetails(execution: DmlExecution): string {
    const details: string[] = [];

    if (typeof execution.usage?.statements?.current === 'number') {
      details.push(`Statements ${execution.usage.statements.current}`);
    }

    if (typeof execution.usage?.rows?.current === 'number') {
      details.push(`Rows ${execution.usage.rows.current}`);
    }

    return details.join(', ');
  }

  return (
    <ol className="dml-execution-list">
      {executions.map((execution) => (
        <li
          className={
            execution.entryId === selectedEntryId
              ? 'dml-execution-item limit-execution-item-selected'
              : 'dml-execution-item'
          }
          key={execution.id}
          onClick={() => onSelectTimelineEntry(execution.entryId)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectTimelineEntry(execution.entryId);
            }
          }}
          ref={
            execution.entryId === selectedEntryId ? selectedItemRef : undefined
          }
          role="button"
          tabIndex={0}
        >
          <header className="dml-execution-header">
            <div>
              <strong>{formatTitle(execution)}</strong>
              <span>{formatPrimaryDetails(execution)}</span>
              {formatUsageDetails(execution) && (
                <span>{formatUsageDetails(execution)}</span>
              )}
            </div>
          </header>
        </li>
      ))}
    </ol>
  );
}
