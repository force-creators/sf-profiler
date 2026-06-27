import { describe, expect, it } from 'vitest';
import { EntryFactory } from '../src/parser/entries/EntryFactory';
import { parseLine } from '../src/parser/lines/parseLine';

describe('EntryFactory', () => {
  it('classifies flow record lookup entries with SOQL data operation metadata', () => {
    const factory = new EntryFactory();
    const entry = factory.create(
      parseLine(
        '12:00:00.0 (8000000)|FLOW_BULK_ELEMENT_BEGIN|FlowRecordLookup|Find_Contacts',
        2
      ),
      0,
      undefined,
      8
    );

    expect(entry).toMatchObject({
      id: 0,
      event: 'FLOW_BULK_ELEMENT_BEGIN',
      type: 'workflow',
      detail: 'Find_Contacts',
      lineNumber: 2,
      time: 8,
      metadata: {
        flow: {
          elementType: 'FlowRecordLookup',
          elementName: 'Find_Contacts',
          dataOperations: ['soql'],
        },
      },
    });
  });

  it('extracts SOQL explain metadata and preserves parent linkage', () => {
    const factory = new EntryFactory();
    const parent = factory.create(
      parseLine(
        '12:00:00.0 (4000000)|SOQL_EXECUTE_BEGIN|[2]|Aggregations:0|SELECT Id FROM Account',
        2
      ),
      0,
      undefined,
      4
    );
    const explain = factory.create(
      parseLine(
        '12:00:00.0 (6000000)|SOQL_EXECUTE_EXPLAIN|[2]|Index on Account : [Id], cardinality: 1, sobjectCardinality: 31238, relativeCost 0',
        3
      ),
      1,
      parent,
      6
    );

    expect(parent).toMatchObject({
      type: 'soql',
      metadata: {
        line: 2,
        soql: {
          query: 'SELECT Id FROM Account',
          aggregations: 0,
        },
      },
    });
    expect(explain).toMatchObject({
      parentId: 0,
      metadata: {
        line: 2,
        soql: {
          cardinality: 1,
          sobjectCardinality: 31238,
          relativeCost: 0,
        },
      },
    });
  });
});
