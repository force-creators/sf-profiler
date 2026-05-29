import type { LimitDetail, LimitType } from './limits';

export type LogEntryType =
  | 'apex'
  | 'workflow'
  | 'dml'
  | 'soql'
  | 'limit'
  | 'other';

export type ApexLogEntryMetadata = {
  line?: number;
  codeUnit?: string;
  method?: string;
  trigger?: string;
  soql?: {
    query?: string;
    rows?: number;
    aggregations?: number;
    explain?: string;
    relativeCost?: number;
    cardinality?: number;
    sobjectCardinality?: number;
    usage?: {
      queries?: LimitUsageSnapshot;
      rows?: LimitUsageSnapshot;
      aggregations?: LimitUsageSnapshot;
    };
  };
  dml?: {
    operation?: string;
    object?: string;
    rows?: number;
    usage?: {
      statements?: LimitUsageSnapshot;
      rows?: LimitUsageSnapshot;
    };
  };
};

export type LimitUsageSnapshot = {
  current: number;
  max: number;
};

export type SoqlExecution = {
  id: number;
  entryId: number;
  lineNumber: number;
  apexLine?: number;
  time: number;
  endTime?: number;
  duration?: number;
  query: string;
  normalizedQuery: string;
  rows?: number;
  aggregations?: number;
  usage?: {
    queries?: LimitUsageSnapshot;
    rows?: LimitUsageSnapshot;
    aggregations?: LimitUsageSnapshot;
  };
  explain?: {
    detail: string;
    relativeCost?: number;
    cardinality?: number;
    sobjectCardinality?: number;
  };
  duplicateCount: number;
  duplicateOfId?: number;
};

export type DmlExecution = {
  id: number;
  entryId: number;
  lineNumber: number;
  apexLine?: number;
  time: number;
  endTime?: number;
  duration?: number;
  operation?: string;
  object?: string;
  rows?: number;
  usage?: {
    statements?: LimitUsageSnapshot;
    rows?: LimitUsageSnapshot;
  };
};

export type ApexLogEntry = {
  id: number;
  logLine: string;
  event: string;
  type: LogEntryType;
  detail: string;
  lineNumber: number;
  children: number[];
  parentId?: number;
  time: number;
  nano: number;
  duration?: number;
  endTime?: number;
  endLineNumber?: number;
  limitDetail?: LimitDetail;
  metadata?: ApexLogEntryMetadata;
};

export type ApexLogProfile = {
  sourceName?: string;
  entries: ApexLogEntry[];
  rootIds: number[];
  limits: Partial<Record<LimitType, LimitDetail[]>>;
  soqlExecutions: SoqlExecution[];
  dmlExecutions: DmlExecution[];
  executionTime: number;
  totalLines: number;
  processedLines: number;
};

export type ParseApexLogOptions = {
  sourceName?: string;
  onProgress?: (progress: number) => void;
};
