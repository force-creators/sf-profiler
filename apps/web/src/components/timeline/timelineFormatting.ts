import type { ApexLogEntry } from '@sfdc-profiler/core';

export function formatTimelineContent(entry: ApexLogEntry): string {
  return compactLabel(entry.detail || entry.event || entry.type, 72);
}

export function formatTimelineTitle(entry: ApexLogEntry): string {
  return [
    entry.detail || entry.event || entry.type,
    `${entry.time} ms - ${entry.endTime} ms`,
    `${entry.duration} ms`,
  ].join('\n');
}

function compactLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}
