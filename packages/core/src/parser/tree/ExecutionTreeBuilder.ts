import { AutomationCollector } from '../../automation/AutomationCollector';
import type { ApexLogEntry } from '../../types';
import { END_EVENTS, START_EVENTS, isFlowLimitUsageEvent } from '../events';
import {
  mergeDmlLimitUsage,
  mergeEndMetadata,
  mergeFlowLimitUsage,
  mergeSoqlExplain,
  mergeSoqlLimitUsage,
} from '../entries/metadata/merge';
import { ExecutionCollector } from './ExecutionCollector';

export class ExecutionTreeBuilder {
  readonly entries: ApexLogEntry[] = [];
  readonly rootIds: number[] = [];

  private readonly parentStack: ApexLogEntry[] = [];

  constructor(
    private readonly executionCollector: ExecutionCollector,
    private readonly automationCollector: AutomationCollector
  ) {}

  get nextEntryId(): number {
    return this.entries.length;
  }

  get currentParent(): ApexLogEntry | undefined {
    return this.parentStack[this.parentStack.length - 1];
  }

  process(entry: ApexLogEntry) {
    if (END_EVENTS.has(entry.event) && this.parentStack.length > 0) {
      this.closeCurrentParent(entry);
      return;
    }

    if (entry.event === 'LIMIT_USAGE') {
      mergeSoqlLimitUsage(this.currentParent, entry);
      this.executionCollector.mergeRecentSoqlRowsUsage(entry);
      mergeDmlLimitUsage(this.currentParent, entry);
      return;
    }

    if (isFlowLimitUsageEvent(entry.event)) {
      mergeFlowLimitUsage(this.currentParent, entry);
      return;
    }

    if (entry.event === 'SOQL_EXECUTE_EXPLAIN') {
      mergeSoqlExplain(this.currentParent, entry);
      return;
    }

    if (!START_EVENTS.has(entry.event)) {
      return;
    }

    this.addStartedEntry(entry);
  }

  private closeCurrentParent(endEntry: ApexLogEntry) {
    const parent = this.parentStack.pop();

    if (!parent) {
      return;
    }

    mergeEndMetadata(parent, endEntry);
    parent.duration = endEntry.time - parent.time;
    parent.endTime = endEntry.time;
    parent.endLineNumber = endEntry.lineNumber;

    if (parent.type === 'soql') {
      const execution = this.executionCollector.addSoqlExecution(parent);
      this.automationCollector.recordSoqlExecution(execution);
    }

    if (parent.type === 'dml') {
      const execution = this.executionCollector.addDmlExecution(parent);
      this.automationCollector.recordDmlExecution(execution);
    }
  }

  private addStartedEntry(entry: ApexLogEntry) {
    const parent = this.currentParent;

    if (parent) {
      parent.children.push(entry.id);
    } else {
      this.rootIds.push(entry.id);
    }

    this.entries.push(entry);
    this.parentStack.push(entry);
  }
}
