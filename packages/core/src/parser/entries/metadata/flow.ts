import type {
  ApexLogEntry,
  ApexLogEntryMetadata,
  FlowDataOperation,
  FlowLimitUsageMetrics,
} from '../../../types';
import { isFlowLimitUsageEvent } from '../../events';
import {
  field,
  getDetailValue,
  parseBracketedLineNumber,
} from '../../lines/fields';
import type { ParsedLine } from '../../lines/parseLine';

const FLOW_DML_ELEMENT_TYPES = new Set([
  'FlowRecordCreate',
  'FlowRecordDelete',
  'FlowRecordUpdate',
]);

export function isFlowMetadataEvent(line: ParsedLine): boolean {
  return (
    (line.event === 'CODE_UNIT_STARTED' &&
      getDetailValue(line).startsWith('Flow:')) ||
    line.event === 'FLOW_CREATE_INTERVIEW_END' ||
    line.event === 'FLOW_START_INTERVIEW_BEGIN' ||
    line.event === 'FLOW_START_INTERVIEW_END' ||
    line.event === 'FLOW_INTERVIEW_FINISHED' ||
    line.event === 'FLOW_ELEMENT_BEGIN' ||
    line.event === 'FLOW_ELEMENT_END' ||
    line.event === 'FLOW_BULK_ELEMENT_BEGIN' ||
    line.event === 'FLOW_BULK_ELEMENT_END'
  );
}

export function extractFlowMetadata(line: ParsedLine): ApexLogEntryMetadata {
  const metadata: ApexLogEntryMetadata = {
    line: parseBracketedLineNumber(field(line.raw, 2)),
    flow: {},
  };

  if (line.event === 'CODE_UNIT_STARTED') {
    const detail = getDetailValue(line);

    metadata.codeUnit = detail;
    metadata.flow = {
      object: parseFlowObject(detail),
    };
  } else if (
    line.event === 'FLOW_CREATE_INTERVIEW_END' ||
    line.event === 'FLOW_START_INTERVIEW_BEGIN' ||
    line.event === 'FLOW_START_INTERVIEW_END' ||
    line.event === 'FLOW_INTERVIEW_FINISHED'
  ) {
    metadata.flow = {
      interviewId: field(line.raw, 2) || undefined,
      flowName: field(line.raw, 3) || undefined,
    };
  } else if (
    line.event === 'FLOW_ELEMENT_BEGIN' ||
    line.event === 'FLOW_ELEMENT_END'
  ) {
    metadata.flow = {
      interviewId: field(line.raw, 2) || undefined,
      elementType: field(line.raw, 3) || undefined,
      elementName: field(line.raw, 4) || undefined,
    };
  } else {
    metadata.flow = {
      elementType: field(line.raw, 2) || undefined,
      elementName: field(line.raw, 3) || undefined,
    };
  }

  const operation = getFlowDataOperationForElementType(
    metadata.flow?.elementType
  );

  if (operation) {
    metadata.flow ??= {};
    metadata.flow.dataOperations = [operation];
  }

  return metadata;
}

export function mergeFlowLimitUsage(
  parent: ApexLogEntry | undefined,
  entry: ApexLogEntry
) {
  if (
    parent?.type !== 'workflow' ||
    parent.metadata?.flow === undefined ||
    !isFlowLimitUsageEvent(entry.event)
  ) {
    return;
  }

  const usage = parseFlowLimitUsage(entry.detail);

  if (!usage) {
    return;
  }

  parent.metadata.flow.usage ??= {};
  parent.metadata.flow.usage[usage.metric] = {
    consumed: usage.consumed,
    current: usage.current,
    max: usage.max,
  };
}

export function mergeFlowDataOperations(
  left: FlowDataOperation[] | undefined,
  right: FlowDataOperation[] | undefined
): FlowDataOperation[] | undefined {
  const operations = new Set([...(left ?? []), ...(right ?? [])]);
  const orderedOperations: FlowDataOperation[] = [];

  if (operations.has('soql')) {
    orderedOperations.push('soql');
  }

  if (operations.has('dml')) {
    orderedOperations.push('dml');
  }

  return orderedOperations.length > 0 ? orderedOperations : undefined;
}

function parseFlowObject(detail: string): string | undefined {
  return detail.startsWith('Flow:')
    ? detail.slice('Flow:'.length) || undefined
    : undefined;
}

function getFlowDataOperationForElementType(
  elementType: string | undefined
): FlowDataOperation | undefined {
  if (elementType === 'FlowRecordLookup') {
    return 'soql';
  }

  if (elementType && FLOW_DML_ELEMENT_TYPES.has(elementType)) {
    return 'dml';
  }

  return undefined;
}

function parseFlowLimitUsage(
  detail: string
):
  | {
      metric: keyof FlowLimitUsageMetrics;
      consumed: number;
      current: number;
      max: number;
    }
  | undefined {
  const metric = getFlowLimitMetric(detail);
  const totalIndex = detail.indexOf(', total ');

  if (!metric || totalIndex === -1) {
    return undefined;
  }

  const consumed = Number.parseInt(detail, 10);
  const outOfIndex = detail.indexOf(' out of ', totalIndex + ', total '.length);

  if (outOfIndex === -1) {
    return undefined;
  }

  const current = Number.parseInt(
    detail.slice(totalIndex + ', total '.length, outOfIndex),
    10
  );
  const max = Number.parseInt(detail.slice(outOfIndex + ' out of '.length), 10);

  if (Number.isNaN(consumed) || Number.isNaN(current) || Number.isNaN(max)) {
    return undefined;
  }

  return {
    metric,
    consumed,
    current,
    max,
  };
}

function getFlowLimitMetric(
  detail: string
): keyof FlowLimitUsageMetrics | undefined {
  if (detail.includes('CPU time')) {
    return 'cpuMs';
  }

  if (detail.includes('SOQL query rows')) {
    return 'soqlRows';
  }

  if (detail.includes('SOQL queries')) {
    return 'soqlQueries';
  }

  if (detail.includes('DML statements')) {
    return 'dmlStatements';
  }

  if (detail.includes('DML rows')) {
    return 'dmlRows';
  }

  return undefined;
}
