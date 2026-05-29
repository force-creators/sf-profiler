export const limitTypes = {
  soqlQueries: 'soql_queries',
  soqlQueryRows: 'soql_query_rows',
  dmlStatements: 'dml_statements',
  dmlRows: 'dml_rows',
  dmlPublishImmediate: 'dml_push_immediate',
  cpuTime: 'cpu_time',
  heapSize: 'heap_size',
  callouts: 'callouts',
  future: 'future',
  queueable: 'queueable',
} as const;

export type LimitType = (typeof limitTypes)[keyof typeof limitTypes];

export type LimitDetail = {
  name: LimitType;
  current: number;
  max: number;
  time: number;
};
