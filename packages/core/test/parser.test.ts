import { describe, expect, it } from 'vitest';
import { limitTypes, parseApexLog } from '../src';
import type { ProfileInsight, RecursionInsightEvidence } from '../src';

const sampleLog = [
  '59.0 APEX_CODE,FINEST',
  '12:00:00.0 (1000000)|EXECUTION_STARTED',
  '12:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|01q000000000000|AccountTrigger on Account trigger event BeforeInsert|__sfdc_trigger/AccountTrigger',
  '12:00:00.0 (3000000)|METHOD_ENTRY|[1]|01p000000000000|AccountService.run()',
  '12:00:00.0 (4000000)|SOQL_EXECUTE_BEGIN|[2]|Aggregations:0|SELECT Id FROM Account',
  '12:00:00.0 (5000000)|LIMIT_USAGE|[2]|SOQL|1|100',
  '12:00:00.0 (6000000)|SOQL_EXECUTE_EXPLAIN|[2]|Index on Account : [Id], cardinality: 1, sobjectCardinality: 31238, relativeCost 0',
  '12:00:00.0 (7000000)|SOQL_EXECUTE_END|[2]|Rows:1',
  '12:00:00.0 (7500000)|LIMIT_USAGE|[2]|SOQL_ROWS|1|50000',
  '12:00:00.0 (8000000)|SOQL_EXECUTE_BEGIN|[2]|Aggregations:0|SELECT Id FROM Account',
  '12:00:00.0 (8500000)|SOQL_EXECUTE_END|[2]|Rows:1',
  '12:00:00.0 (8600000)|LIMIT_USAGE|[2]|SOQL_ROWS|2|50000',
  '12:00:00.0 (9000000)|DML_BEGIN|[270]|Op:Insert|Type:Task|Rows:1',
  '12:00:00.0 (10000000)|LIMIT_USAGE|[270]|DML|1|150',
  '12:00:00.0 (11000000)|LIMIT_USAGE|[270]|DML_ROWS|1|10000',
  '12:00:00.0 (12000000)|DML_END|[270]',
  '12:00:00.0 (13000000)|METHOD_EXIT|[1]|AccountService.run()',
  '12:00:00.0 (14000000)|CODE_UNIT_FINISHED|AccountTrigger on Account trigger event BeforeInsert|__sfdc_trigger/AccountTrigger',
  '  Number of SOQL queries: 1 out of 100',
  '  Maximum CPU time: 10 out of 10000',
  '12:00:00.0 (15000000)|EXECUTION_FINISHED',
].join('\n');

describe('parseApexLog', () => {
  it('builds a nested execution tree and limit series', () => {
    const profile = parseApexLog(sampleLog, { sourceName: 'sample.log' });

    expect(profile.sourceName).toBe('sample.log');
    expect(profile.rootIds).toEqual([0]);
    expect(profile.entries[0]?.children).toEqual([1]);
    expect(profile.entries[1]?.children).toEqual([2, 3, 4]);
    expect(profile.entries[2]?.duration).toBe(3);
    expect(profile.entries[2]?.lineNumber).toBe(5);
    expect(profile.entries[2]?.metadata?.soql).toMatchObject({
      aggregations: 0,
      query: 'SELECT Id FROM Account',
      rows: 1,
      cardinality: 1,
      relativeCost: 0,
      usage: {
        queries: {
          current: 1,
          max: 100,
        },
      },
    });
    expect(profile.soqlExecutions).toHaveLength(2);
    expect(profile.soqlExecutions[0]).toMatchObject({
      duplicateCount: 2,
      query: 'SELECT Id FROM Account',
      rows: 1,
      usage: {
        rows: {
          current: 1,
          max: 50000,
        },
      },
    });
    expect(profile.soqlExecutions[1]).toMatchObject({
      duplicateCount: 2,
      duplicateOfId: 0,
      normalizedQuery: 'select id from account',
      usage: {
        rows: {
          current: 2,
          max: 50000,
        },
      },
    });
    expect(profile.entries[4]?.metadata?.dml).toMatchObject({
      operation: 'Insert',
      object: 'Task',
      rows: 1,
      usage: {
        statements: {
          current: 1,
          max: 150,
        },
        rows: {
          current: 1,
          max: 10000,
        },
      },
    });
    expect(profile.dmlExecutions).toHaveLength(1);
    expect(profile.dmlExecutions[0]).toMatchObject({
      operation: 'Insert',
      object: 'Task',
      rows: 1,
      usage: {
        statements: {
          current: 1,
          max: 150,
        },
        rows: {
          current: 1,
          max: 10000,
        },
      },
    });
    expect(profile.executionTime).toBe(14);
    expect(profile.limits[limitTypes.soqlQueries]?.[0]).toMatchObject({
      current: 1,
      max: 100,
      time: 5,
    });
    expect(profile.limits[limitTypes.soqlQueries]?.[1]).toMatchObject({
      current: 1,
      max: 100,
      time: 14,
    });
    expect(profile.limits[limitTypes.soqlQueryRows]?.[0]).toMatchObject({
      current: 1,
      max: 50000,
      time: 7,
    });
    expect(profile.limits[limitTypes.soqlQueryRows]?.[1]).toMatchObject({
      current: 2,
      max: 50000,
      time: 8,
    });
    expect(profile.limits[limitTypes.dmlStatements]?.[0]).toMatchObject({
      current: 1,
      max: 150,
      time: 10,
    });
    expect(profile.limits[limitTypes.dmlRows]?.[0]).toMatchObject({
      current: 1,
      max: 10000,
      time: 11,
    });
    expect(profile.limits[limitTypes.cpuTime]?.[0]).toMatchObject({
      current: 10,
      max: 10000,
      time: 14,
    });
    expect(profile.insights).toContainEqual(
      expect.objectContaining({
        kind: 'duplicate-soql',
        severity: 'warning',
        title: 'SOQL query ran 2 times',
        evidence: expect.objectContaining({
          count: 2,
          executionIds: [0, 1],
          executionEntryIds: [2, 3],
          query: 'SELECT Id FROM Account',
          totalRows: 2,
        }),
      })
    );
  });

  it('classifies flow code units as workflow entries', () => {
    const profile = parseApexLog(
      [
        '59.0 APEX_CODE,FINEST',
        '12:00:00.0 (1000000)|EXECUTION_STARTED',
        '12:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Contact',
        '12:00:00.0 (5000000)|CODE_UNIT_FINISHED|Flow:Contact',
        '12:00:00.0 (6000000)|EXECUTION_FINISHED',
      ].join('\n')
    );

    expect(profile.entries[0]).toMatchObject({
      event: 'CODE_UNIT_STARTED',
      type: 'workflow',
      detail: 'Flow:Contact',
      metadata: {
        codeUnit: 'Flow:Contact',
        flow: {
          object: 'Contact',
        },
      },
    });
  });

  it('classifies execute anonymous code units as apex entries', () => {
    const profile = parseApexLog(
      [
        '59.0 APEX_CODE,FINEST',
        '12:00:00.0 (1000000)|EXECUTION_STARTED',
        '12:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|execute_anonymous_apex',
        '12:00:00.0 (5000000)|CODE_UNIT_FINISHED|execute_anonymous_apex',
        '12:00:00.0 (6000000)|EXECUTION_FINISHED',
      ].join('\n')
    );

    expect(profile.entries[0]).toMatchObject({
      event: 'CODE_UNIT_STARTED',
      type: 'apex',
      detail: 'execute_anonymous_apex',
      metadata: {
        codeUnit: 'execute_anonymous_apex',
      },
    });
  });

  it('reports performance insights for entries over configured thresholds', () => {
    const profile = parseApexLog(
      [
        '59.0 APEX_CODE,FINEST',
        '12:00:00.0 (1000000)|EXECUTION_STARTED',
        '12:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|execute_anonymous_apex',
        '12:00:00.0 (10000000)|SOQL_EXECUTE_BEGIN|[2]|Aggregations:0|SELECT Id FROM Account',
        '12:00:00.0 (400000000)|SOQL_EXECUTE_END|[2]|Rows:1',
        '12:00:00.0 (500000000)|DML_BEGIN|[3]|Op:Update|Type:Account|Rows:1',
        '12:00:02.0 (2100000000)|DML_END|[3]',
        '12:00:02.0 (2200000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Account',
        '12:00:03.0 (3300000000)|CODE_UNIT_FINISHED|Flow:Account',
        '12:00:03.0 (3500000000)|CODE_UNIT_FINISHED|execute_anonymous_apex',
        '12:00:03.0 (3600000000)|EXECUTION_FINISHED',
      ].join('\n')
    );

    const performanceInsights = profile.insights.filter(
      (insight) => insight.kind === 'performance'
    );

    expect(performanceInsights).toHaveLength(4);
    expect(performanceInsights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          title: 'Slow DML: Update Account',
          evidence: expect.objectContaining({
            category: 'dml',
            duration: 1600,
            threshold: 1500,
          }),
        }),
        expect.objectContaining({
          severity: 'warning',
          title: 'Slow SOQL: SELECT Id FROM Account',
          evidence: expect.objectContaining({
            category: 'soql',
            duration: 390,
            threshold: 300,
          }),
        }),
        expect.objectContaining({
          severity: 'warning',
          title: 'Slow Apex: execute_anonymous_apex',
          evidence: expect.objectContaining({
            category: 'apex',
            duration: 3498,
            threshold: 1000,
          }),
        }),
        expect.objectContaining({
          severity: 'warning',
          title: 'Slow Flow: Flow:Account',
          evidence: expect.objectContaining({
            category: 'flow',
            duration: 1100,
            threshold: 1000,
          }),
        }),
      ])
    );
  });

  it('identifies recursive trigger contexts caused by nested DML', () => {
    const recursiveLog = [
      '59.0 APEX_CODE,FINEST',
      '12:00:00.0 (1000000)|EXECUTION_STARTED',
      '12:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|01q000000000000|AccountTrigger on Account trigger event BeforeUpdate|__sfdc_trigger/AccountTrigger',
      '12:00:00.0 (3000000)|DML_BEGIN|[42]|Op:Update|Type:Account|Rows:1',
      '12:00:00.0 (4000000)|CODE_UNIT_STARTED|[EXTERNAL]|01q000000000000|AccountTrigger on Account trigger event BeforeUpdate|__sfdc_trigger/AccountTrigger',
      '12:00:00.0 (5000000)|CODE_UNIT_FINISHED|AccountTrigger on Account trigger event BeforeUpdate|__sfdc_trigger/AccountTrigger',
      '12:00:00.0 (6000000)|DML_END|[42]',
      '12:00:00.0 (7000000)|CODE_UNIT_FINISHED|AccountTrigger on Account trigger event BeforeUpdate|__sfdc_trigger/AccountTrigger',
      '12:00:00.0 (8000000)|EXECUTION_FINISHED',
    ].join('\n');

    const profile = parseApexLog(recursiveLog);

    expect(profile.insights).toHaveLength(1);
    expect(profile.insights[0]).toMatchObject({
      kind: 'recursion',
      severity: 'serious',
      title: 'Possible recursion in Account before update',
      evidence: {
        context: {
          triggerName: 'AccountTrigger',
          object: 'Account',
          event: 'BeforeUpdate',
          label: 'Account before update',
        },
        triggerEntryId: 0,
        dmlEntryIds: [1],
        recursiveTriggerEntryIds: [2],
        causingEntryIds: [1, 2],
      },
    });
  });

  it('identifies recursive trigger contexts caused by cross-object automation', () => {
    const recursiveLog = [
      '59.0 APEX_CODE,FINEST',
      '12:00:00.0 (1000000)|EXECUTION_STARTED',
      '12:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|01q000000000000|AccountTrigger on Account trigger event AfterUpdate|__sfdc_trigger/AccountTrigger',
      '12:00:00.0 (3000000)|DML_BEGIN|[42]|Op:Update|Type:Contact|Rows:1',
      '12:00:00.0 (4000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Contact',
      '12:00:00.0 (5000000)|FLOW_CREATE_INTERVIEW_END|contact-1|Contact Flow',
      '12:00:00.0 (6000000)|FLOW_ELEMENT_BEGIN|contact-1|FlowRecordUpdate|Update_Parent_Account',
      '12:00:00.0 (7000000)|FLOW_ELEMENT_END|contact-1|FlowRecordUpdate|Update_Parent_Account',
      '12:00:00.0 (8000000)|FLOW_BULK_ELEMENT_BEGIN|FlowRecordUpdate|Update_Parent_Account',
      '12:00:00.0 (9000000)|CODE_UNIT_STARTED|[EXTERNAL]|01q000000000000|AccountTrigger on Account trigger event AfterUpdate|__sfdc_trigger/AccountTrigger',
      '12:00:00.0 (10000000)|CODE_UNIT_FINISHED|AccountTrigger on Account trigger event AfterUpdate|__sfdc_trigger/AccountTrigger',
      '12:00:00.0 (11000000)|FLOW_BULK_ELEMENT_END|FlowRecordUpdate|Update_Parent_Account|1|3',
      '12:00:00.0 (12000000)|FLOW_INTERVIEW_FINISHED|contact-1|Contact Flow',
      '12:00:00.0 (13000000)|CODE_UNIT_FINISHED|Flow:Contact',
      '12:00:00.0 (14000000)|DML_END|[42]',
      '12:00:00.0 (15000000)|CODE_UNIT_FINISHED|AccountTrigger on Account trigger event AfterUpdate|__sfdc_trigger/AccountTrigger',
      '12:00:00.0 (16000000)|EXECUTION_FINISHED',
    ].join('\n');

    const profile = parseApexLog(recursiveLog);

    expect(profile.insights).toHaveLength(2);
    expect(profile.insights[0]).toMatchObject({
      kind: 'recursion',
      severity: 'serious',
      title: 'Possible recursion in Account after update',
      evidence: {
        context: {
          triggerName: 'AccountTrigger',
          object: 'Account',
          event: 'AfterUpdate',
          label: 'Account after update',
        },
        triggerEntryId: 0,
        dmlEntryIds: [1],
        recursiveTriggerEntryIds: [6],
      },
    });
    expect(profile.insights[1]).toMatchObject({
      kind: 'recursion',
      severity: 'serious',
      title: 'Possible recursion in Contact Flow',
      summary:
        'Automation loop detected: Contact Flow -> Update_Parent_Account -> Account after update -> Update Contact -> Contact Flow.',
      evidence: {
        context: {
          kind: 'flow',
          flowName: 'Contact Flow',
          object: 'Contact',
          label: 'Contact Flow',
        },
      },
    });
  });

  it('identifies declarative recursion caused by flow record updates', () => {
    const recursiveFlowLog = [
      '59.0 APEX_CODE,FINEST',
      '12:00:00.0 (1000000)|EXECUTION_STARTED',
      '12:00:00.0 (2000000)|DML_BEGIN|[10]|Op:Update|Type:SObject|Rows:2',
      '12:00:00.0 (3000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Account',
      '12:00:00.0 (4000000)|FLOW_CREATE_INTERVIEW_END|account-1|Account Flow',
      '12:00:00.0 (5000000)|FLOW_START_INTERVIEW_BEGIN|account-1|Account Flow',
      '12:00:00.0 (6000000)|FLOW_START_INTERVIEW_END|account-1|Account Flow',
      '12:00:00.0 (7000000)|FLOW_ELEMENT_BEGIN|account-1|FlowRecordUpdate|Update_Related_Contacts',
      '12:00:00.0 (8000000)|FLOW_ELEMENT_END|account-1|FlowRecordUpdate|Update_Related_Contacts',
      '12:00:00.0 (9000000)|FLOW_BULK_ELEMENT_BEGIN|FlowRecordUpdate|Update_Related_Contacts',
      '12:00:00.0 (10000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Contact',
      '12:00:00.0 (11000000)|FLOW_CREATE_INTERVIEW_END|contact-1|Contact Flow',
      '12:00:00.0 (12000000)|FLOW_START_INTERVIEW_BEGIN|contact-1|Contact Flow',
      '12:00:00.0 (13000000)|FLOW_START_INTERVIEW_END|contact-1|Contact Flow',
      '12:00:00.0 (14000000)|FLOW_ELEMENT_BEGIN|contact-1|FlowRecordUpdate|Update_Parent_Account',
      '12:00:00.0 (15000000)|FLOW_ELEMENT_END|contact-1|FlowRecordUpdate|Update_Parent_Account',
      '12:00:00.0 (16000000)|FLOW_BULK_ELEMENT_BEGIN|FlowRecordUpdate|Update_Parent_Account',
      '12:00:00.0 (17000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Account',
      '12:00:00.0 (18000000)|FLOW_CREATE_INTERVIEW_END|account-2|Account Flow',
      '12:00:00.0 (19000000)|FLOW_START_INTERVIEW_BEGIN|account-2|Account Flow',
      '12:00:00.0 (20000000)|FLOW_START_INTERVIEW_END|account-2|Account Flow',
      '12:00:00.0 (21000000)|FLOW_INTERVIEW_FINISHED|account-2|Account Flow',
      '12:00:00.0 (22000000)|CODE_UNIT_FINISHED|Flow:Account',
      '12:00:00.0 (23000000)|FLOW_BULK_ELEMENT_END|FlowRecordUpdate|Update_Parent_Account|1|7',
      '12:00:00.0 (24000000)|FLOW_INTERVIEW_FINISHED|contact-1|Contact Flow',
      '12:00:00.0 (25000000)|CODE_UNIT_FINISHED|Flow:Contact',
      '12:00:00.0 (26000000)|FLOW_BULK_ELEMENT_END|FlowRecordUpdate|Update_Related_Contacts|1|17',
      '12:00:00.0 (27000000)|FLOW_INTERVIEW_FINISHED|account-1|Account Flow',
      '12:00:00.0 (28000000)|CODE_UNIT_FINISHED|Flow:Account',
      '12:00:00.0 (29000000)|DML_END|[10]',
      '12:00:00.0 (30000000)|EXECUTION_FINISHED',
    ].join('\n');

    const profile = parseApexLog(recursiveFlowLog);

    expect(profile.insights).toHaveLength(2);
    expect(profile.insights[0]).toMatchObject({
      kind: 'recursion',
      severity: 'serious',
      title: 'Possible recursion in Account Flow',
      summary:
        'Automation loop detected: Account Flow -> Update_Related_Contacts -> Contact Flow -> Update_Parent_Account -> Account Flow.',
      evidence: {
        context: {
          kind: 'flow',
          flowName: 'Account Flow',
          object: 'Account',
          label: 'Account Flow',
        },
      },
    });
    expect(profile.insights[1]).toMatchObject({
      kind: 'recursion',
      severity: 'serious',
      title: 'Possible recursion in Contact Flow',
      summary:
        'Automation loop detected: Contact Flow -> Update_Parent_Account -> Account Flow -> Update_Related_Contacts -> Contact Flow.',
      evidence: {
        context: {
          kind: 'flow',
          flowName: 'Contact Flow',
          object: 'Contact',
          label: 'Contact Flow',
        },
      },
    });
    expect(
      getRecursionEvidence(profile.insights[0])?.causingEntryIds.some(
        (entryId) =>
          profile.entries[entryId]?.metadata?.flow?.elementName ===
          'Update_Parent_Account'
      )
    ).toBe(true);
  });

  it('identifies declarative recursion across sibling flow branches in one DML', () => {
    const recursiveFlowLog = [
      '59.0 APEX_CODE,FINEST',
      '12:00:00.0 (1000000)|EXECUTION_STARTED',
      '12:00:00.0 (2000000)|DML_BEGIN|[10]|Op:Update|Type:SObject|Rows:2',
      '12:00:00.0 (3000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Account',
      '12:00:00.0 (4000000)|FLOW_CREATE_INTERVIEW_END|account-1|Account Flow',
      '12:00:00.0 (5000000)|FLOW_START_INTERVIEW_BEGIN|account-1|Account Flow',
      '12:00:00.0 (6000000)|FLOW_START_INTERVIEW_END|account-1|Account Flow',
      '12:00:00.0 (7000000)|FLOW_ELEMENT_BEGIN|account-1|FlowRecordUpdate|Update_Related_Contacts',
      '12:00:00.0 (8000000)|FLOW_ELEMENT_END|account-1|FlowRecordUpdate|Update_Related_Contacts',
      '12:00:00.0 (9000000)|FLOW_BULK_ELEMENT_BEGIN|FlowRecordUpdate|Update_Related_Contacts',
      '12:00:00.0 (10000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Contact',
      '12:00:00.0 (11000000)|FLOW_CREATE_INTERVIEW_END|contact-1|Contact Flow',
      '12:00:00.0 (12000000)|FLOW_START_INTERVIEW_BEGIN|contact-1|Contact Flow',
      '12:00:00.0 (13000000)|FLOW_START_INTERVIEW_END|contact-1|Contact Flow',
      '12:00:00.0 (14000000)|FLOW_ELEMENT_BEGIN|contact-1|FlowRecordUpdate|Update_Parent_Account',
      '12:00:00.0 (15000000)|FLOW_ELEMENT_END|contact-1|FlowRecordUpdate|Update_Parent_Account',
      '12:00:00.0 (16000000)|FLOW_BULK_ELEMENT_BEGIN|FlowRecordUpdate|Update_Parent_Account',
      '12:00:00.0 (17000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Account',
      '12:00:00.0 (18000000)|FLOW_CREATE_INTERVIEW_END|account-2|Account Flow',
      '12:00:00.0 (19000000)|FLOW_START_INTERVIEW_BEGIN|account-2|Account Flow',
      '12:00:00.0 (20000000)|FLOW_START_INTERVIEW_END|account-2|Account Flow',
      '12:00:00.0 (21000000)|FLOW_INTERVIEW_FINISHED|account-2|Account Flow',
      '12:00:00.0 (22000000)|CODE_UNIT_FINISHED|Flow:Account',
      '12:00:00.0 (23000000)|FLOW_BULK_ELEMENT_END|FlowRecordUpdate|Update_Parent_Account|1|7',
      '12:00:00.0 (24000000)|FLOW_INTERVIEW_FINISHED|contact-1|Contact Flow',
      '12:00:00.0 (25000000)|CODE_UNIT_FINISHED|Flow:Contact',
      '12:00:00.0 (26000000)|FLOW_BULK_ELEMENT_END|FlowRecordUpdate|Update_Related_Contacts|1|17',
      '12:00:00.0 (27000000)|FLOW_INTERVIEW_FINISHED|account-1|Account Flow',
      '12:00:00.0 (28000000)|CODE_UNIT_FINISHED|Flow:Account',
      '12:00:00.0 (29000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Contact',
      '12:00:00.0 (30000000)|FLOW_CREATE_INTERVIEW_END|contact-2|Contact Flow',
      '12:00:00.0 (31000000)|FLOW_START_INTERVIEW_BEGIN|contact-2|Contact Flow',
      '12:00:00.0 (32000000)|FLOW_START_INTERVIEW_END|contact-2|Contact Flow',
      '12:00:00.0 (33000000)|FLOW_INTERVIEW_FINISHED|contact-2|Contact Flow',
      '12:00:00.0 (34000000)|CODE_UNIT_FINISHED|Flow:Contact',
      '12:00:00.0 (35000000)|DML_END|[10]',
      '12:00:00.0 (36000000)|EXECUTION_FINISHED',
    ].join('\n');

    const profile = parseApexLog(recursiveFlowLog);
    const insightTitles = profile.insights.map((insight) => insight.title);
    const contactInsight = profile.insights.find(
      (insight) => insight.title === 'Possible recursion in Contact Flow'
    );

    expect(insightTitles).toContain('Possible recursion in Account Flow');
    expect(insightTitles).toContain('Possible recursion in Contact Flow');
    expect(
      getRecursionEvidence(contactInsight)?.causingEntryIds.some(
        (entryId) =>
          profile.entries[entryId]?.metadata?.flow?.elementName ===
          'Update_Related_Contacts'
      )
    ).toBe(true);
  });
});

function getRecursionEvidence(
  insight: ProfileInsight | undefined
): RecursionInsightEvidence | undefined {
  return insight?.evidence && 'context' in insight.evidence
    ? insight.evidence
    : undefined;
}
