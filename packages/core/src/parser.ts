import { createDmlExecution, createSoqlExecution } from './parserExecutions';
import {
  field,
  getDetailValue,
  parseBracketedLineNumber,
  parseExplainNumber,
  parseLabeledNumber,
  parseLabeledText,
  parseLine,
  trimTrailingCarriageReturn,
  type ParsedLine,
} from './parserFields';
import { parseLimit } from './parserLimits';
import type {
  ApexLogEntry,
  ApexLogEntryMetadata,
  ApexLogProfile,
  DmlExecution,
  LogEntryType,
  ParseApexLogOptions,
  SoqlExecution,
} from './types';

const START_EVENTS = new Set([
  'SOQL_EXECUTE_BEGIN',
  'DML_BEGIN',
  'CODE_UNIT_STARTED',
  'METHOD_ENTRY',
  'FLOW_START_INTERVIEW_BEGIN',
  'WF_CRITERIA_BEGIN',
  'WF_RULE_EVAL_BEGIN',
  'FLOW_CREATE_INTERVIEW_END',
]);

const END_EVENTS = new Set([
  'SOQL_EXECUTE_END',
  'DML_END',
  'CODE_UNIT_FINISHED',
  'METHOD_EXIT',
  'FLOW_START_INTERVIEW_END',
  'WF_CRITERIA_END',
  'WF_RULE_EVAL_END',
  'WF_RULE_NOT_EVALUATED',
  'FLOW_INTERVIEW_FINISHED',
]);

const WORKFLOW_EVENTS = new Set([
  'WF_CRITERIA_BEGIN',
  'WF_CRITERIA_END',
  'FLOW_START_INTERVIEW_BEGIN',
  'FLOW_START_INTERVIEW_END',
  'WF_RULE_EVAL_BEGIN',
  'WF_RULE_EVAL_END',
  'WF_RULE_NOT_EVALUATED',
  'FLOW_CREATE_INTERVIEW_END',
  'FLOW_INTERVIEW_FINISHED',
]);

export function parseApexLog(
  logText: string,
  options: ParseApexLogOptions = {}
): ApexLogProfile {
  const entries: ApexLogEntry[] = [];
  const rootIds: number[] = [];
  const parentStack: ApexLogEntry[] = [];
  const limits: ApexLogProfile['limits'] = {};
  const soqlExecutions: SoqlExecution[] = [];
  const dmlExecutions: DmlExecution[] = [];
  let lastReportedTime = 0;
  let lastProgress = 0;
  let processedLines = 0;
  let lineNumber = 0;
  let lineStart = 0;

  while (lineStart <= logText.length) {
    const newlineIndex = logText.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? logText.length : newlineIndex;
    const rawLine = trimTrailingCarriageReturn(
      logText.slice(lineStart, lineEnd)
    );
    lineNumber += 1;

    if (lineNumber > 1 && shouldProcess(rawLine)) {
      processedLines += 1;
      const parsedLine = parseLine(rawLine, lineNumber);

      if (parsedLine.time) {
        lastReportedTime = parsedLine.time;
      }

      const entry = createEntry(
        parsedLine,
        entries.length,
        parentStack[parentStack.length - 1],
        lastReportedTime
      );

      if (entry.limitDetail) {
        limits[entry.limitDetail.name] ??= [];
        limits[entry.limitDetail.name]?.push(entry.limitDetail);
      }

      processEntry(
        entry,
        entries,
        rootIds,
        parentStack,
        soqlExecutions,
        dmlExecutions
      );
    }

    const progress = Math.ceil((lineEnd / Math.max(logText.length, 1)) * 100);
    if (progress !== lastProgress) {
      options.onProgress?.(progress);
      lastProgress = progress;
    }

    if (newlineIndex === -1) {
      break;
    }

    lineStart = newlineIndex + 1;
  }

  return {
    sourceName: options.sourceName,
    entries,
    rootIds,
    limits,
    soqlExecutions,
    dmlExecutions,
    executionTime: lastReportedTime,
    totalLines: lineNumber,
    processedLines,
  };
}

export function shouldProcess(line: string): boolean {
  if (
    line.length === 0 ||
    line.includes('FLOW_START_INTERVIEW_LIMIT_USAGE') ||
    line.includes('System.Type.equals')
  ) {
    return false;
  }

  return (
    line.includes('LIMIT_USAGE') ||
    line.includes('SOQL_EXECUTE_BEGIN') ||
    line.includes('SOQL_EXECUTE_EXPLAIN') ||
    line.includes('SOQL_EXECUTE_END') ||
    line.includes('DML_BEGIN') ||
    line.includes('DML_END') ||
    line.includes('USER_INFO') ||
    line.includes('EXECUTION_STARTED') ||
    line.includes('CODE_UNIT_STARTED') ||
    line.includes('CODE_UNIT_FINISHED') ||
    line.includes('METHOD_ENTRY') ||
    line.includes('METHOD_EXIT') ||
    line.includes('FLOW_START_INTERVIEW_BEGIN') ||
    line.includes('FLOW_START_INTERVIEW_END') ||
    line.includes('WF_CRITERIA_BEGIN') ||
    line.includes('WF_CRITERIA_END') ||
    line.includes('WF_RULE_EVAL_BEGIN') ||
    line.includes('WF_RULE_EVAL_END') ||
    line.includes('WF_RULE_NOT_EVALUATED') ||
    line.includes('FLOW_CREATE_INTERVIEW_END') ||
    line.includes('FLOW_INTERVIEW_FINISHED') ||
    line.includes('Number of') ||
    line.includes('Maximum ')
  );
}

function createEntry(
  parsedLine: ParsedLine,
  id: number,
  parent: ApexLogEntry | undefined,
  lastReportedTime: number
): ApexLogEntry {
  const type = classifyType(parsedLine);
  const detail = getDetailValue(parsedLine);
  const limitDetail =
    type === 'limit' ? parseLimit(parsedLine.raw, lastReportedTime) : undefined;

  return {
    id,
    logLine: parsedLine.raw,
    event: parsedLine.event,
    type,
    detail,
    lineNumber: parsedLine.lineNumber,
    children: [],
    parentId: parent?.id,
    time: parsedLine.time,
    nano: parsedLine.nano,
    limitDetail,
    metadata: extractMetadata(parsedLine),
  };
}

function processEntry(
  entry: ApexLogEntry,
  entries: ApexLogEntry[],
  rootIds: number[],
  parentStack: ApexLogEntry[],
  soqlExecutions: SoqlExecution[],
  dmlExecutions: DmlExecution[]
) {
  if (END_EVENTS.has(entry.event) && parentStack.length > 0) {
    const parent = parentStack.pop();

    if (parent) {
      mergeEndMetadata(parent, entry);
      parent.duration = entry.time - parent.time;
      parent.endTime = entry.time;
      parent.endLineNumber = entry.lineNumber;

      if (parent.type === 'soql') {
        soqlExecutions.push(createSoqlExecution(parent, soqlExecutions));
      }

      if (parent.type === 'dml') {
        dmlExecutions.push(createDmlExecution(parent, dmlExecutions));
      }
    }

    return;
  }

  if (entry.event === 'LIMIT_USAGE') {
    mergeSoqlLimitUsage(parentStack[parentStack.length - 1], entry);
    mergeRecentSoqlRowsUsage(soqlExecutions, entry);
    mergeDmlLimitUsage(parentStack[parentStack.length - 1], entry);
    return;
  }

  if (entry.event === 'SOQL_EXECUTE_EXPLAIN') {
    mergeSoqlExplain(parentStack[parentStack.length - 1], entry);
    return;
  }

  if (!START_EVENTS.has(entry.event)) {
    return;
  }

  const parent = parentStack[parentStack.length - 1];

  if (parent) {
    parent.children.push(entry.id);
  } else {
    rootIds.push(entry.id);
  }

  entries.push(entry);
  parentStack.push(entry);
}

function classifyType(line: ParsedLine): LogEntryType {
  if (
    line.event === 'METHOD_ENTRY' ||
    line.event === 'METHOD_EXIT' ||
    line.raw.includes('__sfdc_trigger')
  ) {
    return 'apex';
  }

  if (
    WORKFLOW_EVENTS.has(line.event) ||
    getDetailValue(line).includes('Workflow:')
  ) {
    return 'workflow';
  }

  if (line.event === 'DML_BEGIN' || line.event === 'DML_END') {
    return 'dml';
  }

  if (
    line.event === 'SOQL_EXECUTE_BEGIN' ||
    line.event === 'SOQL_EXECUTE_EXPLAIN' ||
    line.event === 'SOQL_EXECUTE_END'
  ) {
    return 'soql';
  }

  if (
    line.event === 'LIMIT_USAGE' ||
    line.raw.includes('Number of ') ||
    line.raw.includes('Maximum ')
  ) {
    return 'limit';
  }

  return 'other';
}

function extractMetadata(line: ParsedLine): ApexLogEntryMetadata | undefined {
  if (
    line.event === 'SOQL_EXECUTE_BEGIN' ||
    line.event === 'SOQL_EXECUTE_EXPLAIN' ||
    line.event === 'SOQL_EXECUTE_END'
  ) {
    return extractSoqlMetadata(line);
  }

  if (line.event === 'DML_BEGIN' || line.event === 'DML_END') {
    return extractDmlMetadata(line);
  }

  if (
    line.event === 'METHOD_ENTRY' ||
    line.event === 'CODE_UNIT_STARTED' ||
    line.raw.includes('__sfdc_trigger')
  ) {
    return extractApexMetadata(line);
  }

  return undefined;
}

function extractSoqlMetadata(line: ParsedLine): ApexLogEntryMetadata {
  const queryLine = parseBracketedLineNumber(field(line.raw, 2));
  const metadata: ApexLogEntryMetadata = {
    line: queryLine,
    soql: {},
  };

  if (line.event === 'SOQL_EXECUTE_BEGIN') {
    metadata.soql = {
      query: field(line.raw, 4),
      aggregations: parseLabeledNumber(field(line.raw, 3), 'Aggregations:'),
    };
  } else if (line.event === 'SOQL_EXECUTE_END') {
    metadata.soql = {
      rows: parseLabeledNumber(field(line.raw, 3), 'Rows:'),
    };
  } else {
    const explain = field(line.raw, 3);
    metadata.soql = {
      explain,
      cardinality: parseExplainNumber(explain, 'cardinality:'),
      sobjectCardinality: parseExplainNumber(explain, 'sobjectCardinality:'),
      relativeCost: parseExplainNumber(explain, 'relativeCost'),
    };
  }

  return metadata;
}

function mergeSoqlLimitUsage(parent: ApexLogEntry | undefined, entry: ApexLogEntry) {
  if (parent?.type !== 'soql' || entry.event !== 'LIMIT_USAGE') {
    return;
  }

  const usageType = field(entry.logLine, 3);
  const snapshot = {
    current: Number.parseInt(field(entry.logLine, 4), 10) || 0,
    max: Number.parseInt(field(entry.logLine, 5), 10) || 0,
  };

  parent.metadata ??= {};
  parent.metadata.soql ??= {};
  parent.metadata.soql.usage ??= {};

  if (usageType === 'SOQL') {
    parent.metadata.soql.usage.queries = snapshot;
  }

  if (usageType === 'SOQL_ROWS') {
    parent.metadata.soql.usage.rows = snapshot;
  }

  if (usageType === 'AGGS') {
    parent.metadata.soql.usage.aggregations = snapshot;
  }
}

function mergeRecentSoqlRowsUsage(
  soqlExecutions: SoqlExecution[],
  entry: ApexLogEntry
) {
  if (entry.event !== 'LIMIT_USAGE' || field(entry.logLine, 3) !== 'SOQL_ROWS') {
    return;
  }

  const latestExecution = soqlExecutions.at(-1);

  if (!latestExecution) {
    return;
  }

  latestExecution.usage ??= {};
  latestExecution.usage.rows = {
    current: Number.parseInt(field(entry.logLine, 4), 10) || 0,
    max: Number.parseInt(field(entry.logLine, 5), 10) || 0,
  };
}

function mergeSoqlExplain(parent: ApexLogEntry | undefined, entry: ApexLogEntry) {
  if (parent?.type !== 'soql' || !entry.metadata?.soql) {
    return;
  }

  parent.metadata ??= {};
  parent.metadata.soql = {
    ...parent.metadata.soql,
    ...entry.metadata.soql,
  };
}

function extractDmlMetadata(line: ParsedLine): ApexLogEntryMetadata {
  if (line.event === 'DML_END') {
    const rows = parseLabeledNumber(field(line.raw, 3), 'Rows:');

    return {
      line: parseBracketedLineNumber(field(line.raw, 2)),
      dml: rows === undefined ? {} : { rows },
    };
  }

  return {
    line: parseBracketedLineNumber(field(line.raw, 2)),
    dml: {
      operation: parseLabeledText(field(line.raw, 3), 'Op:'),
      object: parseLabeledText(field(line.raw, 4), 'Type:'),
      rows: parseLabeledNumber(field(line.raw, 5), 'Rows:'),
    },
  };
}

function mergeDmlLimitUsage(parent: ApexLogEntry | undefined, entry: ApexLogEntry) {
  if (parent?.type !== 'dml' || entry.event !== 'LIMIT_USAGE') {
    return;
  }

  const usageType = field(entry.logLine, 3);
  const snapshot = {
    current: Number.parseInt(field(entry.logLine, 4), 10) || 0,
    max: Number.parseInt(field(entry.logLine, 5), 10) || 0,
  };

  parent.metadata ??= {};
  parent.metadata.dml ??= {};
  parent.metadata.dml.usage ??= {};

  if (usageType === 'DML') {
    parent.metadata.dml.usage.statements = snapshot;
  }

  if (usageType === 'DML_ROWS') {
    parent.metadata.dml.usage.rows = snapshot;
  }
}

function mergeEndMetadata(parent: ApexLogEntry, endEntry: ApexLogEntry) {
  if (parent.type !== endEntry.type || !endEntry.metadata) {
    return;
  }

  if (endEntry.metadata.soql) {
    parent.metadata ??= {};
    parent.metadata.soql = {
      ...parent.metadata.soql,
      ...endEntry.metadata.soql,
    };
  }

  if (endEntry.metadata.dml) {
    parent.metadata ??= {};
    parent.metadata.dml = {
      ...parent.metadata.dml,
      ...endEntry.metadata.dml,
    };
  }
}

function extractApexMetadata(line: ParsedLine): ApexLogEntryMetadata {
  const detail = getDetailValue(line);
  const method = line.event === 'METHOD_ENTRY' ? detail : undefined;

  return {
    line: parseBracketedLineNumber(field(line.raw, 2)),
    codeUnit: line.event === 'CODE_UNIT_STARTED' ? field(line.raw, 4) : undefined,
    method,
    trigger: line.raw.includes('__sfdc_trigger') ? detail : undefined,
  };
}
