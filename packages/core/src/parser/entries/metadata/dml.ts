import type { ApexLogEntry, ApexLogEntryMetadata } from '../../../types';
import {
  field,
  parseBracketedLineNumber,
  parseLabeledNumber,
  parseLabeledText,
} from '../../lines/fields';
import type { ParsedLine } from '../../lines/parseLine';

export function extractDmlMetadata(line: ParsedLine): ApexLogEntryMetadata {
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

export function mergeDmlLimitUsage(
  parent: ApexLogEntry | undefined,
  entry: ApexLogEntry
) {
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
