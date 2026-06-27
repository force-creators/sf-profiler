import type {
  DuplicateSoqlInsightEvidence,
  ProfileInsight,
  SoqlExecution,
} from '../types';
import { compactQuery, sumDefinedNumbers } from './insightUtils';

export function findDuplicateSoqlInsights(
  soqlExecutions: SoqlExecution[]
): ProfileInsight[] {
  const executionsByQuery = new Map<string, SoqlExecution[]>();

  for (const execution of soqlExecutions) {
    const existing = executionsByQuery.get(execution.normalizedQuery) ?? [];
    existing.push(execution);
    executionsByQuery.set(execution.normalizedQuery, existing);
  }

  return Array.from(executionsByQuery.values())
    .filter((executions) => executions.length > 1)
    .sort((left, right) => right.length - left.length || left[0].id - right[0].id)
    .map((executions, index) => createDuplicateSoqlInsight(executions, index));
}

function createDuplicateSoqlInsight(
  executions: SoqlExecution[],
  index: number
): ProfileInsight {
  const firstExecution = executions[0];
  const totalDuration = sumDefinedNumbers(
    executions.map((execution) => execution.duration)
  );
  const totalRows = sumDefinedNumbers(executions.map((execution) => execution.rows));
  const evidence: DuplicateSoqlInsightEvidence = {
    query: firstExecution.query,
    normalizedQuery: firstExecution.normalizedQuery,
    executionIds: executions.map((execution) => execution.id),
    executionEntryIds: executions.map((execution) => execution.entryId),
    count: executions.length,
    totalDuration,
    totalRows,
  };

  return {
    id: `duplicate-soql-${index + 1}-${firstExecution.id}`,
    kind: 'duplicate-soql',
    severity: 'warning',
    title: `SOQL query ran ${executions.length} times`,
    summary: `${compactQuery(firstExecution.query)} ran ${executions.length} times in this transaction.`,
    entryIds: evidence.executionEntryIds,
    evidence,
  };
}
