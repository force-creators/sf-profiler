import type { ApexLogEntry, DmlExecution, SoqlExecution } from './types';

export function createSoqlExecution(
  entry: ApexLogEntry,
  existingExecutions: SoqlExecution[]
): SoqlExecution {
  const soql = entry.metadata?.soql;
  const query = soql?.query ?? entry.detail;
  const normalizedQuery = normalizeSoqlQuery(query);
  const firstDuplicate = existingExecutions.find(
    (execution) => execution.normalizedQuery === normalizedQuery
  );
  const duplicateCount =
    existingExecutions.filter(
      (execution) => execution.normalizedQuery === normalizedQuery
    ).length + 1;
  const execution: SoqlExecution = {
    id: existingExecutions.length,
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

  for (const previousExecution of existingExecutions) {
    if (previousExecution.normalizedQuery === normalizedQuery) {
      previousExecution.duplicateCount = duplicateCount;
    }
  }

  return execution;
}

export function createDmlExecution(
  entry: ApexLogEntry,
  existingExecutions: DmlExecution[]
): DmlExecution {
  const dml = entry.metadata?.dml;

  return {
    id: existingExecutions.length,
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

function normalizeSoqlQuery(query: string): string {
  return query
    .replace(/:[A-Za-z_$][\w$]*/g, ':?')
    .replace(/\b\d+(?:\.\d+)?\b/g, '?')
    .replace(/'[^']*'/g, "'?'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
