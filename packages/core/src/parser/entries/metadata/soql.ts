import type { ApexLogEntry, ApexLogEntryMetadata } from '../../../types';
import {
  field,
  parseBracketedLineNumber,
  parseExplainNumber,
  parseLabeledNumber,
} from '../../lines/fields';
import type { ParsedLine } from '../../lines/parseLine';

export function extractSoqlMetadata(line: ParsedLine): ApexLogEntryMetadata {
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

export function mergeSoqlLimitUsage(
  parent: ApexLogEntry | undefined,
  entry: ApexLogEntry
) {
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

export function mergeSoqlExplain(
  parent: ApexLogEntry | undefined,
  entry: ApexLogEntry
) {
  if (parent?.type !== 'soql' || !entry.metadata?.soql) {
    return;
  }

  parent.metadata ??= {};
  parent.metadata.soql = {
    ...parent.metadata.soql,
    ...entry.metadata.soql,
  };
}
