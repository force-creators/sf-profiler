export type TimelineGroupId = 'soql' | 'dml' | 'run';

export const timelineGroups: Array<{ id: TimelineGroupId; content: string }> = [
  { id: 'soql', content: 'SOQL' },
  { id: 'dml', content: 'DML' },
  { id: 'run', content: 'Run' },
];
