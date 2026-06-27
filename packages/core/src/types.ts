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
  flow?: {
    interviewId?: string;
    flowName?: string;
    object?: string;
    elementType?: string;
    elementName?: string;
    dataOperations?: FlowDataOperation[];
    usage?: FlowLimitUsageMetrics;
  };
};

export type LimitUsageSnapshot = {
  current: number;
  max: number;
};

export type FlowDataOperation = 'soql' | 'dml';

export type FlowLimitUsage = {
  consumed: number;
  current: number;
  max: number;
};

export type FlowLimitUsageMetrics = {
  cpuMs?: FlowLimitUsage;
  soqlQueries?: FlowLimitUsage;
  soqlRows?: FlowLimitUsage;
  dmlStatements?: FlowLimitUsage;
  dmlRows?: FlowLimitUsage;
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

export type ProfileInsightSeverity = 'info' | 'warning' | 'serious' | 'error';

export type ProfileInsightKind = 'recursion' | 'duplicate-soql' | 'performance';

export type PerformanceInsightCategory = 'dml' | 'soql' | 'apex' | 'flow';

export type PerformanceInsightThresholds = Record<
  PerformanceInsightCategory,
  number
>;

export type RecursionInsightEvidence = {
  context: {
    kind?: 'trigger' | 'flow';
    triggerName?: string;
    flowName?: string;
    object?: string;
    event?: string;
    label: string;
  };
  triggerEntryId: number;
  recursiveTriggerEntryIds: number[];
  dmlEntryIds: number[];
  causingEntryIds: number[];
};

export type DuplicateSoqlInsightEvidence = {
  query: string;
  normalizedQuery: string;
  executionIds: number[];
  executionEntryIds: number[];
  count: number;
  totalDuration?: number;
  totalRows?: number;
};

export type PerformanceInsightEvidence = {
  category: PerformanceInsightCategory;
  entryId: number;
  label: string;
  duration: number;
  threshold: number;
  lineNumber: number;
};

export type ProfileInsightEvidence =
  | RecursionInsightEvidence
  | DuplicateSoqlInsightEvidence
  | PerformanceInsightEvidence;

export type ProfileInsight = {
  id: string;
  kind: ProfileInsightKind;
  severity: ProfileInsightSeverity;
  title: string;
  summary: string;
  entryIds: number[];
  automationUnitIds?: string[];
  automationExecutionIds?: string[];
  evidence?: ProfileInsightEvidence;
};

export type AutomationKind =
  | 'flow'
  | 'trigger'
  | 'workflow'
  | 'process-builder'
  | 'duplicate-rule'
  | 'apex'
  | 'platform'
  | 'other';

export type AutomationMetricConfidence =
  | 'exact'
  | 'inferred'
  | 'duration'
  | 'unknown';

export type AutomationMetric = {
  value: number;
  confidence: AutomationMetricConfidence;
};

export type AutomationFlagKind =
  | 'recursive'
  | 'cascade-cycle'
  | 'performance'
  | 'duplicate-soql';

export type AutomationFlag = {
  kind: AutomationFlagKind;
  insightId?: string;
};

export type AutomationMetrics = {
  durationMs?: AutomationMetric;
  cpuMs?: AutomationMetric;
  soqlQueries?: AutomationMetric;
  soqlRows?: AutomationMetric;
  dmlStatements?: AutomationMetric;
  dmlRows?: AutomationMetric;
};

export type AutomationElement = {
  id: string;
  unitId: string;
  name: string;
  type?: string;
  entryIds: number[];
  executionIds: string[];
  metrics: AutomationMetrics;
};

export type AutomationExecution = {
  id: string;
  unitId: string;
  kind: AutomationKind;
  name: string;
  object?: string;
  event?: string;
  startEntryId?: number;
  endEntryId?: number;
  startLineNumber?: number;
  endLineNumber?: number;
  entryIds: number[];
  elementIds: string[];
  soqlExecutionIds: number[];
  dmlExecutionIds: number[];
  metrics: AutomationMetrics;
  flags: AutomationFlag[];
  insightIds: string[];
};

export type AutomationUnit = {
  id: string;
  kind: AutomationKind;
  name: string;
  object?: string;
  event?: string;
  codeUnit?: string;
  entryIds: number[];
  executionIds: string[];
  elementIds: string[];
  metrics: AutomationMetrics;
  flags: AutomationFlag[];
  insightIds: string[];
};

export type AutomationProfile = {
  units: AutomationUnit[];
  executions: AutomationExecution[];
  elements: AutomationElement[];
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
  automation: AutomationProfile;
  insights: ProfileInsight[];
  parserVersion: number;
  executionTime: number;
  totalLines: number;
  processedLines: number;
};

export type ParseApexLogOptions = {
  sourceName?: string;
  onProgress?: (progress: number) => void;
  performanceThresholds?: Partial<PerformanceInsightThresholds>;
};
