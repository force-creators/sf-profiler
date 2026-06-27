import type { ApexLogEntry } from '@sfdc-profiler/core';
import {
  isFlowDmlEntry,
  isFlowSoqlEntry,
  type TimelineFlowDataMetrics,
} from './timelineEntries';

type TimelineFormattingOptions = {
  entriesById?: Map<number, ApexLogEntry>;
  flowDmlCopy?: boolean;
  flowDataByEntryId?: Map<number, TimelineFlowDataMetrics>;
  flowSoqlCopy?: boolean;
  includeFlowPath?: boolean;
};

export function formatTimelineContent(
  entry: ApexLogEntry,
  options: TimelineFormattingOptions = {}
): string {
  return compactLabel(getTimelineLabel(entry, options), 72);
}

export function formatTimelineTitle(
  entry: ApexLogEntry,
  options: TimelineFormattingOptions = {}
): string {
  const titleLines = [
    getTimelineLabel(entry, options),
  ];
  const flowPath =
    options.includeFlowPath && options.entriesById
      ? getFlowPath(entry, options.entriesById)
      : [];

  if (flowPath.length > 1) {
    titleLines.push(`Flow path: ${flowPath.join(' > ')}`);
  }

  titleLines.push(`${entry.time} ms - ${entry.endTime} ms`, `${entry.duration} ms`);

  return titleLines.join('\n');
}

function getTimelineLabel(
  entry: ApexLogEntry,
  options: TimelineFormattingOptions
): string {
  if (
    options.flowDmlCopy &&
    isFlowDmlEntry(entry, options.flowDataByEntryId)
  ) {
    const flowName = options.entriesById
      ? findNearestFlowName(entry, options.entriesById)
      : undefined;
    const elementName = entry.metadata?.flow?.elementName ?? entry.detail;

    return [flowName, elementName].filter(Boolean).join(': ') || 'Flow Update';
  }

  if (
    options.flowSoqlCopy &&
    isFlowSoqlEntry(entry, options.flowDataByEntryId)
  ) {
    const flowName = options.entriesById
      ? findNearestFlowName(entry, options.entriesById)
      : undefined;
    const elementName = entry.metadata?.flow?.elementName ?? entry.detail;

    return [flowName, elementName].filter(Boolean).join(': ') || 'Flow Lookup';
  }

  return entry.detail || entry.event || entry.type;
}

export function findNearestFlowName(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): string | undefined {
  let current: ApexLogEntry | undefined = entry;

  while (current) {
    const flowName = current.metadata?.flow?.flowName;

    if (flowName) {
      return flowName;
    }

    current =
      current.parentId === undefined ? undefined : entriesById.get(current.parentId);
  }

  return undefined;
}

function getFlowPath(
  entry: ApexLogEntry,
  entriesById: Map<number, ApexLogEntry>
): string[] {
  const path: string[] = [];
  let current: ApexLogEntry | undefined = entry;

  while (current) {
    const label = getFlowPathLabel(current);

    if (label) {
      path.push(label);
    }

    current =
      current.parentId === undefined ? undefined : entriesById.get(current.parentId);
  }

  return path.reverse().filter((label, index, labels) => label !== labels[index - 1]);
}

function getFlowPathLabel(entry: ApexLogEntry): string | undefined {
  if (entry.event === 'CODE_UNIT_STARTED' && entry.metadata?.flow?.object) {
    return entry.detail || `Flow:${entry.metadata.flow.object}`;
  }

  if (entry.event === 'FLOW_CREATE_INTERVIEW_END') {
    return entry.metadata?.flow?.flowName || entry.detail || undefined;
  }

  if (
    entry.event === 'FLOW_ELEMENT_BEGIN' ||
    entry.event === 'FLOW_BULK_ELEMENT_BEGIN'
  ) {
    return entry.metadata?.flow?.elementName || entry.detail || undefined;
  }

  return undefined;
}

function compactLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}
