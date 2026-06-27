import { limitTypes, type LimitDetail, type LimitType } from '../../limits';
import type { ApexLogEntry, ApexLogProfile } from '../../types';
import { field } from '../lines/fields';

export class LimitSeriesCollector {
  readonly limits: ApexLogProfile['limits'] = {};

  record(entry: ApexLogEntry) {
    if (!entry.limitDetail) {
      return;
    }

    this.limits[entry.limitDetail.name] ??= [];
    this.limits[entry.limitDetail.name]?.push(entry.limitDetail);
  }
}

export function parseLimit(
  raw: string,
  lastReportedTime: number
): LimitDetail | undefined {
  if (raw.includes('|LIMIT_USAGE|')) {
    const usageType = field(raw, 3);

    if (usageType === 'SOQL') {
      return limit(
        limitTypes.soqlQueries,
        field(raw, 4),
        field(raw, 5),
        lastReportedTime
      );
    }

    if (usageType === 'SOQL_ROWS') {
      return limit(
        limitTypes.soqlQueryRows,
        field(raw, 4),
        field(raw, 5),
        lastReportedTime
      );
    }

    if (usageType === 'DML') {
      return limit(
        limitTypes.dmlStatements,
        field(raw, 4),
        field(raw, 5),
        lastReportedTime
      );
    }

    if (usageType === 'DML_ROWS') {
      return limit(
        limitTypes.dmlRows,
        field(raw, 4),
        field(raw, 5),
        lastReportedTime
      );
    }
  }

  const spaceSplit = raw.trimStart().split(/\s+/);

  if (raw.includes('Number of ')) {
    switch (spaceSplit[2]) {
      case 'SOQL':
        return limit(
          limitTypes.soqlQueries,
          spaceSplit[4],
          spaceSplit[7],
          lastReportedTime
        );
      case 'query':
        return limit(
          limitTypes.soqlQueryRows,
          spaceSplit[4],
          spaceSplit[7],
          lastReportedTime
        );
      case 'DML':
        return limit(
          spaceSplit[3] === 'statements:'
            ? limitTypes.dmlStatements
            : limitTypes.dmlRows,
          spaceSplit[4],
          spaceSplit[7],
          lastReportedTime
        );
      case 'Publish':
        return limit(
          limitTypes.dmlPublishImmediate,
          spaceSplit[5],
          spaceSplit[8],
          lastReportedTime
        );
      case 'callouts:':
        return limit(
          limitTypes.callouts,
          spaceSplit[3],
          spaceSplit[6],
          lastReportedTime
        );
      case 'future':
        return limit(
          limitTypes.future,
          spaceSplit[4],
          spaceSplit[7],
          lastReportedTime
        );
      case 'queueable':
        return limit(
          limitTypes.queueable,
          spaceSplit[8],
          spaceSplit[11],
          lastReportedTime
        );
      default:
        return undefined;
    }
  }

  if (raw.includes('Maximum ')) {
    return limit(
      spaceSplit[1] === 'CPU' ? limitTypes.cpuTime : limitTypes.heapSize,
      spaceSplit[3],
      spaceSplit[6],
      lastReportedTime
    );
  }

  return undefined;
}

function limit(
  name: LimitType,
  current: string | undefined,
  max: string | undefined,
  time: number
): LimitDetail {
  return {
    name,
    current: Number.parseInt(current ?? '0', 10),
    max: Number.parseInt(max ?? '0', 10),
    time,
  };
}
