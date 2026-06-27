import type { ApexLogEntry, DmlExecution, SoqlExecution } from '../../types';
import { normalizeSoqlQuery } from '../../shared/normalize';
import { field } from '../lines/fields';

export class ExecutionCollector {
  readonly soqlExecutions: SoqlExecution[] = [];
  readonly dmlExecutions: DmlExecution[] = [];

  addSoqlExecution(entry: ApexLogEntry): SoqlExecution {
    const execution = this.createSoqlExecution(entry);

    this.soqlExecutions.push(execution);
    return execution;
  }

  addDmlExecution(entry: ApexLogEntry): DmlExecution {
    const execution = this.createDmlExecution(entry);

    this.dmlExecutions.push(execution);
    return execution;
  }

  mergeRecentSoqlRowsUsage(entry: ApexLogEntry) {
    if (
      entry.event !== 'LIMIT_USAGE' ||
      field(entry.logLine, 3) !== 'SOQL_ROWS'
    ) {
      return;
    }

    const latestExecution = this.soqlExecutions.at(-1);

    if (!latestExecution) {
      return;
    }

    latestExecution.usage ??= {};
    latestExecution.usage.rows = {
      current: Number.parseInt(field(entry.logLine, 4), 10) || 0,
      max: Number.parseInt(field(entry.logLine, 5), 10) || 0,
    };
  }

  private createSoqlExecution(entry: ApexLogEntry): SoqlExecution {
    const soql = entry.metadata?.soql;
    const query = soql?.query ?? entry.detail;
    const normalizedQuery = normalizeSoqlQuery(query);
    const firstDuplicate = this.soqlExecutions.find(
      (execution) => execution.normalizedQuery === normalizedQuery
    );
    const duplicateCount =
      this.soqlExecutions.filter(
        (execution) => execution.normalizedQuery === normalizedQuery
      ).length + 1;
    const execution: SoqlExecution = {
      id: this.soqlExecutions.length,
      entryId: entry.id,
      lineNumber: entry.lineNumber,
      apexLine: entry.metadata?.line,
      time: entry.time,
      endTime: entry.endTime,
      duration: entry.duration,
      query,
      normalizedQuery,
      rows: soql?.rows,
      aggregations: soql?.aggregations,
      usage: soql?.usage,
      duplicateCount,
      duplicateOfId: firstDuplicate?.id,
    };

    if (soql?.explain) {
      execution.explain = {
        detail: soql.explain,
        relativeCost: soql.relativeCost,
        cardinality: soql.cardinality,
        sobjectCardinality: soql.sobjectCardinality,
      };
    }

    for (const previousExecution of this.soqlExecutions) {
      if (previousExecution.normalizedQuery === normalizedQuery) {
        previousExecution.duplicateCount = duplicateCount;
      }
    }

    return execution;
  }

  private createDmlExecution(entry: ApexLogEntry): DmlExecution {
    const dml = entry.metadata?.dml;

    return {
      id: this.dmlExecutions.length,
      entryId: entry.id,
      lineNumber: entry.lineNumber,
      apexLine: entry.metadata?.line,
      time: entry.time,
      endTime: entry.endTime,
      duration: entry.duration,
      operation: dml?.operation,
      object: dml?.object,
      rows: dml?.rows,
      usage: dml?.usage,
    };
  }
}
