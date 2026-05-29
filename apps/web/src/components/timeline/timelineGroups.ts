import type { ApexLogEntry } from '@sfdc-profiler/core';

export type TimelineGroupId = ApexLogEntry['type'];

export const timelineGroups: Array<{ id: TimelineGroupId; content: string }> = [
  { id: 'soql', content: 'SOQL' },
  { id: 'dml', content: 'DML' },
  { id: 'apex', content: 'Apex' },
  { id: 'workflow', content: 'Workflow' },
  { id: 'other', content: 'Other' },
];
