import type { ApexLogEntryMetadata } from '../../../types';
import { field, getDetailValue, parseBracketedLineNumber } from '../../lines/fields';
import type { ParsedLine } from '../../lines/parseLine';

export function extractApexMetadata(line: ParsedLine): ApexLogEntryMetadata {
  const detail = getDetailValue(line);
  const method = line.event === 'METHOD_ENTRY' ? detail : undefined;
  const triggerDetail = line.raw.includes('__sfdc_trigger')
    ? field(line.raw, 4) || detail
    : undefined;

  return {
    line: parseBracketedLineNumber(field(line.raw, 2)),
    codeUnit: line.event === 'CODE_UNIT_STARTED' ? detail : undefined,
    method,
    trigger: triggerDetail,
  };
}
