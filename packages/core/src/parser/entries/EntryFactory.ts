import type { ApexLogEntry } from '../../types';
import { getDetailValue } from '../lines/fields';
import type { ParsedLine } from '../lines/parseLine';
import { parseLimit } from '../tree/LimitSeriesCollector';
import { classifyEntry } from './classifyEntry';
import { extractMetadata } from './metadata/merge';

export class EntryFactory {
  create(
    parsedLine: ParsedLine,
    id: number,
    parent: ApexLogEntry | undefined,
    lastReportedTime: number
  ): ApexLogEntry {
    const type = classifyEntry(parsedLine);
    const detail = getDetailValue(parsedLine);
    const limitDetail =
      type === 'limit'
        ? parseLimit(parsedLine.raw, lastReportedTime)
        : undefined;

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
}
