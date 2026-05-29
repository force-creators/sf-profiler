import { describe, expect, it } from 'vitest';
import { limitTypes, parseApexLog } from '../src';

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
  });
});
