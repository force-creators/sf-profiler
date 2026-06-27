import type { ApexLogEntry, ApexLogEntryMetadata } from '../../../types';
import type { ParsedLine } from '../../lines/parseLine';
import { extractApexMetadata } from './apex';
import { extractDmlMetadata, mergeDmlLimitUsage } from './dml';
import {
  extractFlowMetadata,
  isFlowMetadataEvent,
  mergeFlowDataOperations,
  mergeFlowLimitUsage,
} from './flow';
import {
  extractSoqlMetadata,
  mergeSoqlExplain,
  mergeSoqlLimitUsage,
} from './soql';

export {
  mergeDmlLimitUsage,
  mergeFlowLimitUsage,
  mergeSoqlExplain,
  mergeSoqlLimitUsage,
};

export function extractMetadata(
  line: ParsedLine
): ApexLogEntryMetadata | undefined {
  if (
    line.event === 'SOQL_EXECUTE_BEGIN' ||
    line.event === 'SOQL_EXECUTE_EXPLAIN' ||
    line.event === 'SOQL_EXECUTE_END'
  ) {
    return extractSoqlMetadata(line);
  }

  if (line.event === 'DML_BEGIN' || line.event === 'DML_END') {
    return extractDmlMetadata(line);
  }

  if (isFlowMetadataEvent(line)) {
    return extractFlowMetadata(line);
  }

  if (
    line.event === 'METHOD_ENTRY' ||
    line.event === 'CODE_UNIT_STARTED' ||
    line.raw.includes('__sfdc_trigger')
  ) {
    return extractApexMetadata(line);
  }

  return undefined;
}

export function mergeEndMetadata(
  parent: ApexLogEntry,
  endEntry: ApexLogEntry
) {
  if (parent.type !== endEntry.type || !endEntry.metadata) {
    return;
  }

  if (endEntry.metadata.soql) {
    parent.metadata ??= {};
    parent.metadata.soql = {
      ...parent.metadata.soql,
      ...endEntry.metadata.soql,
    };
  }

  if (endEntry.metadata.dml) {
    parent.metadata ??= {};
    parent.metadata.dml = {
      ...parent.metadata.dml,
      ...endEntry.metadata.dml,
    };
  }

  if (endEntry.metadata.flow) {
    parent.metadata ??= {};
    parent.metadata.flow = {
      ...parent.metadata.flow,
      ...endEntry.metadata.flow,
      dataOperations: mergeFlowDataOperations(
        parent.metadata.flow?.dataOperations,
        endEntry.metadata.flow.dataOperations
      ),
      usage: {
        ...parent.metadata.flow?.usage,
        ...endEntry.metadata.flow.usage,
      },
    };
  }
}
