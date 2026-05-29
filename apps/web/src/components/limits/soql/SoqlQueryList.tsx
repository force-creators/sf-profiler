import { useEffect, useRef } from 'react';
import type { SoqlExecution } from '@sfdc-profiler/core';

export function SoqlQueryList({
  executions,
  onSelectTimelineEntry,
  selectedEntryId,
}: {
  executions: SoqlExecution[];
  onSelectTimelineEntry: (entryId: number) => void;
  selectedEntryId?: number;
}) {
  const selectedItemRef = useRef<HTMLLIElement | null>(null);
  const visibleExecutions = executions
    .filter((execution) => execution.duplicateOfId === undefined)
    .sort((left, right) => {
      const duplicateDelta = (right.duplicateCount ?? 1) - (left.duplicateCount ?? 1);

      if (duplicateDelta !== 0) {
        return duplicateDelta;
      }

      const durationDelta = (right.duration ?? 0) - (left.duration ?? 0);

      if (durationDelta !== 0) {
        return durationDelta;
      }

      return left.lineNumber - right.lineNumber;
    });

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    selectedItemRef.current?.focus({ preventScroll: true });
  }, [selectedEntryId]);

  if (visibleExecutions.length === 0) {
    return <p className="muted">No SOQL executions found in this log.</p>;
  }

  function formatPrimaryDetails(execution: SoqlExecution): string {
    const details = [`${execution.duration ?? 0} ms`];

    if (typeof execution.rows === 'number') {
      details.push(`${execution.rows} rows`);
    }

    if (execution.explain?.relativeCost !== undefined) {
      details.push(`Cost ${execution.explain.relativeCost}`);
    }

    if (execution.explain?.cardinality !== undefined) {
      details.push(`Cardinality ${execution.explain.cardinality}`);
    }

    return details.join(', ');
  }

  return (
    <ol className="soql-query-list">
      {visibleExecutions.map((execution) => (
        <li
          className={
            [
              'soql-query-item',
              execution.duplicateCount > 1 ? 'soql-query-item-duplicate' : '',
              execution.entryId === selectedEntryId
                ? 'limit-execution-item-selected'
                : '',
            ]
              .filter(Boolean)
              .join(' ')
          }
          key={execution.id}
          onClick={() => onSelectTimelineEntry(execution.entryId)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectTimelineEntry(execution.entryId);
            }
          }}
          role="button"
          ref={
            execution.entryId === selectedEntryId ? selectedItemRef : undefined
          }
          tabIndex={0}
        >
          <header className="soql-query-header">
            <div>
              <strong title={execution.query}>{execution.query}</strong>
              <span>{formatPrimaryDetails(execution)}</span>
            </div>
            <div className="soql-query-actions">
              {execution.duplicateCount > 1 && (
                <span className="soql-query-badge">
                  {execution.duplicateOfId === undefined
                    ? `${execution.duplicateCount}x total`
                    : 'duplicate'}
                </span>
              )}
            </div>
          </header>
        </li>
      ))}
    </ol>
  );
}
