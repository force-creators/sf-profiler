import { describe, expect, it } from 'vitest';
import {
  parseFlowDelta,
  parseFlowSnapshot,
} from '../src/automation/flowUsageParser';

describe('flowUsageParser', () => {
  it('parses flow interview usage snapshots', () => {
    expect(parseFlowSnapshot('SOQL queries: 2 out of 100')).toEqual({
      metric: 'soqlQueries',
      current: 2,
    });
    expect(parseFlowSnapshot('CPU time in ms: 20 out of 15000')).toEqual({
      metric: 'cpuMs',
      current: 20,
    });
  });

  it('parses flow element usage deltas', () => {
    expect(parseFlowDelta('4 SOQL query rows, total 9 out of 50000')).toEqual({
      metric: 'soqlRows',
      delta: 4,
    });
    expect(parseFlowDelta('8 ms CPU time, total 30 out of 15000')).toEqual({
      metric: 'cpuMs',
      delta: 8,
    });
  });
});
