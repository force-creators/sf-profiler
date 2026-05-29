import { limitTypes, type LimitType } from '@sfdc-profiler/core';

export const limitLabels: Record<LimitType, string> = {
  [limitTypes.soqlQueries]: 'SOQL Queries',
  [limitTypes.soqlQueryRows]: 'SOQL Rows',
  [limitTypes.dmlStatements]: 'DML Statements',
  [limitTypes.dmlRows]: 'DML Rows',
  [limitTypes.dmlPublishImmediate]: 'Publish Immediate DML',
  [limitTypes.cpuTime]: 'CPU Time',
  [limitTypes.heapSize]: 'Heap Size',
  [limitTypes.callouts]: 'Callouts',
  [limitTypes.future]: 'Future Calls',
  [limitTypes.queueable]: 'Queueables',
};
