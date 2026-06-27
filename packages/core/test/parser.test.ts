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

  it('aggregates flow automation by real flow name with exact flow usage metrics', () => {
    const profile = parseApexLog(
      [
        '59.0 APEX_CODE,FINEST',
        '12:00:00.0 (1000000)|EXECUTION_STARTED',
        '12:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Account',
        '12:00:00.0 (3000000)|FLOW_CREATE_INTERVIEW_END|account-1|Account Automation',
        '12:00:00.0 (4000000)|FLOW_START_INTERVIEW_BEGIN|account-1|Account Automation',
        '12:00:00.0 (4100000)|FLOW_START_INTERVIEW_LIMIT_USAGE|SOQL queries: 2 out of 100',
        '12:00:00.0 (4200000)|FLOW_START_INTERVIEW_LIMIT_USAGE|SOQL query rows: 5 out of 50000',
        '12:00:00.0 (4300000)|FLOW_START_INTERVIEW_LIMIT_USAGE|DML statements: 1 out of 150',
        '12:00:00.0 (4400000)|FLOW_START_INTERVIEW_LIMIT_USAGE|DML rows: 3 out of 10000',
        '12:00:00.0 (4500000)|FLOW_START_INTERVIEW_LIMIT_USAGE|CPU time in ms: 20 out of 15000',
        '12:00:00.0 (5000000)|FLOW_ELEMENT_BEGIN|account-1|FlowDecision|Should_Update',
        '12:00:00.0 (5100000)|FLOW_ELEMENT_LIMIT_USAGE|2 ms CPU time, total 22 out of 15000',
        '12:00:00.0 (5200000)|FLOW_ELEMENT_END|account-1|FlowDecision|Should_Update',
        '12:00:00.0 (6000000)|FLOW_START_INTERVIEW_END|account-1|Account Automation',
        '12:00:00.0 (7000000)|FLOW_BULK_ELEMENT_BEGIN|FlowRecordUpdate|Update_Contacts',
        '12:00:00.0 (8000000)|FLOW_BULK_ELEMENT_LIMIT_USAGE|1 SOQL queries, total 3 out of 100',
        '12:00:00.0 (8100000)|FLOW_BULK_ELEMENT_LIMIT_USAGE|4 SOQL query rows, total 9 out of 50000',
        '12:00:00.0 (8200000)|FLOW_BULK_ELEMENT_LIMIT_USAGE|1 DML statements, total 2 out of 150',
        '12:00:00.0 (8300000)|FLOW_BULK_ELEMENT_LIMIT_USAGE|2 DML rows, total 5 out of 10000',
        '12:00:00.0 (8400000)|FLOW_BULK_ELEMENT_LIMIT_USAGE|8 ms CPU time, total 30 out of 15000',
        '12:00:00.0 (9000000)|FLOW_BULK_ELEMENT_END|FlowRecordUpdate|Update_Contacts|1|2',
        '12:00:00.0 (10000000)|FLOW_INTERVIEW_FINISHED|account-1|Account Automation',
        '12:00:00.0 (10100000)|FLOW_INTERVIEW_FINISHED_LIMIT_USAGE|SOQL queries: 3 out of 100',
        '12:00:00.0 (10200000)|FLOW_INTERVIEW_FINISHED_LIMIT_USAGE|SOQL query rows: 9 out of 50000',
        '12:00:00.0 (10300000)|FLOW_INTERVIEW_FINISHED_LIMIT_USAGE|DML statements: 2 out of 150',
        '12:00:00.0 (10400000)|FLOW_INTERVIEW_FINISHED_LIMIT_USAGE|DML rows: 5 out of 10000',
        '12:00:00.0 (10500000)|FLOW_INTERVIEW_FINISHED_LIMIT_USAGE|CPU time in ms: 30 out of 15000',
        '12:00:00.0 (11000000)|CODE_UNIT_FINISHED|Flow:Account',
        '12:00:00.0 (12000000)|EXECUTION_FINISHED',
      ].join('\n')
    );

    const flowUnit = profile.automation.units.find(
      (unit) => unit.kind === 'flow' && unit.name === 'Account Automation'
    );

    expect(flowUnit).toMatchObject({
      kind: 'flow',
      name: 'Account Automation',
      object: 'Account',
      metrics: {
        cpuMs: { value: 10, confidence: 'exact' },
        soqlQueries: { value: 1, confidence: 'exact' },
        soqlRows: { value: 4, confidence: 'exact' },
        dmlStatements: { value: 1, confidence: 'exact' },
        dmlRows: { value: 2, confidence: 'exact' },
      },
    });
    expect(flowUnit?.name).not.toBe('Flow:Account');

    const updateElement = profile.automation.elements.find(
      (element) => element.name === 'Update_Contacts'
    );

    expect(updateElement).toMatchObject({
      type: 'FlowRecordUpdate',
      metrics: {
        cpuMs: { value: 8, confidence: 'exact' },
        soqlQueries: { value: 1, confidence: 'exact' },
        soqlRows: { value: 4, confidence: 'exact' },
        dmlStatements: { value: 1, confidence: 'exact' },
        dmlRows: { value: 2, confidence: 'exact' },
      },
    });

    const updateEntry = profile.entries.find(
      (entry) =>
        entry.event === 'FLOW_BULK_ELEMENT_BEGIN' &&
        entry.metadata?.flow?.elementName === 'Update_Contacts'
    );

    expect(updateEntry?.metadata?.flow).toMatchObject({
      elementType: 'FlowRecordUpdate',
      dataOperations: ['dml'],
      usage: {
        cpuMs: { consumed: 8, current: 30, max: 15000 },
        soqlQueries: { consumed: 1, current: 3, max: 100 },
        soqlRows: { consumed: 4, current: 9, max: 50000 },
        dmlStatements: { consumed: 1, current: 2, max: 150 },
        dmlRows: { consumed: 2, current: 5, max: 10000 },
      },
    });
  });

  it('identifies flow record lookups as SOQL with consumed limit metadata', () => {
    const profile = parseApexLog(
      [
        '59.0 APEX_CODE,FINEST',
        '12:00:00.0 (1000000)|EXECUTION_STARTED',
        '12:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Account',
        '12:00:00.0 (3000000)|FLOW_CREATE_INTERVIEW_END|account-1|Account Automation',
        '12:00:00.0 (4000000)|FLOW_START_INTERVIEW_BEGIN|account-1|Account Automation',
        '12:00:00.0 (5000000)|FLOW_ELEMENT_BEGIN|account-1|FlowRecordLookup|Find_Contacts',
        '12:00:00.0 (6000000)|FLOW_ELEMENT_END|account-1|FlowRecordLookup|Find_Contacts',
        '12:00:00.0 (7000000)|FLOW_START_INTERVIEW_END|account-1|Account Automation',
        '12:00:00.0 (8000000)|FLOW_BULK_ELEMENT_BEGIN|FlowRecordLookup|Find_Contacts',
        '12:00:00.0 (9000000)|FLOW_BULK_ELEMENT_LIMIT_USAGE|1 SOQL queries, total 1 out of 100',
        '12:00:00.0 (9100000)|FLOW_BULK_ELEMENT_LIMIT_USAGE|3 SOQL query rows, total 3 out of 50000',
        '12:00:00.0 (9200000)|FLOW_BULK_ELEMENT_LIMIT_USAGE|5 ms CPU time, total 25 out of 15000',
        '12:00:00.0 (10000000)|FLOW_BULK_ELEMENT_END|FlowRecordLookup|Find_Contacts|3|2',
        '12:00:00.0 (11000000)|FLOW_INTERVIEW_FINISHED|account-1|Account Automation',
        '12:00:00.0 (12000000)|CODE_UNIT_FINISHED|Flow:Account',
        '12:00:00.0 (13000000)|EXECUTION_FINISHED',
      ].join('\n')
    );

    const lookupEntry = profile.entries.find(
      (entry) =>
        entry.event === 'FLOW_BULK_ELEMENT_BEGIN' &&
        entry.metadata?.flow?.elementName === 'Find_Contacts'
    );

    expect(lookupEntry?.metadata?.flow).toMatchObject({
      elementType: 'FlowRecordLookup',
      dataOperations: ['soql'],
      usage: {
        cpuMs: { consumed: 5, current: 25, max: 15000 },
        soqlQueries: { consumed: 1, current: 1, max: 100 },
        soqlRows: { consumed: 3, current: 3, max: 50000 },
      },
    });
  });

  it('aggregates trigger automation duration and descendant database work', () => {
    const profile = parseApexLog(
      [
        '59.0 APEX_CODE,FINEST',
        '12:00:00.0 (1000000)|EXECUTION_STARTED',
        '12:00:00.0 (2000000)|CODE_UNIT_STARTED|[EXTERNAL]|01q000000000000|AccountTrigger on Account trigger event BeforeInsert|__sfdc_trigger/AccountTrigger',
        '12:00:00.0 (3000000)|SOQL_EXECUTE_BEGIN|[2]|Aggregations:0|SELECT Id FROM Account',
        '12:00:00.0 (4000000)|SOQL_EXECUTE_END|[2]|Rows:2',
        '12:00:00.0 (5000000)|DML_BEGIN|[3]|Op:Insert|Type:Task|Rows:2',
        '12:00:00.0 (6000000)|DML_END|[3]',
        '12:00:00.0 (9000000)|CODE_UNIT_FINISHED|AccountTrigger on Account trigger event BeforeInsert|__sfdc_trigger/AccountTrigger',
        '12:00:00.0 (10000000)|EXECUTION_FINISHED',
      ].join('\n')
    );

    const triggerUnit = profile.automation.units.find(
      (unit) => unit.kind === 'trigger'
    );

    expect(triggerUnit).toMatchObject({
      name: 'AccountTrigger',
      object: 'Account',
      event: 'BeforeInsert',
      metrics: {
        durationMs: { value: 7, confidence: 'duration' },
        soqlQueries: { value: 1, confidence: 'inferred' },
        soqlRows: { value: 2, confidence: 'inferred' },
        dmlStatements: { value: 1, confidence: 'inferred' },
        dmlRows: { value: 2, confidence: 'inferred' },
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
