import type { LogEntryType } from '../../types';
import { WORKFLOW_EVENTS } from '../events';
import { getDetailValue } from '../lines/fields';
import type { ParsedLine } from '../lines/parseLine';

export function classifyEntry(line: ParsedLine): LogEntryType {
  if (
    line.event === 'METHOD_ENTRY' ||
    line.event === 'METHOD_EXIT' ||
    line.raw.includes('__sfdc_trigger') ||
    (line.event === 'CODE_UNIT_STARTED' &&
      getDetailValue(line) === 'execute_anonymous_apex')
  ) {
    return 'apex';
  }

  if (
    WORKFLOW_EVENTS.has(line.event) ||
    (line.event === 'CODE_UNIT_STARTED' &&
      getDetailValue(line).startsWith('Flow:')) ||
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
