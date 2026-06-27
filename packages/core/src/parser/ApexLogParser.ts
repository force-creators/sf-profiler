import {
  AutomationCollector,
  finalizeAutomationInsights,
} from '../automation/AutomationCollector';
import { findProfileInsights } from '../insights/findProfileInsights';
import type { ApexLogProfile, ParseApexLogOptions } from '../types';
import { EntryFactory } from './entries/EntryFactory';
import { LogLineScanner } from './lines/LogLineScanner';
import { parseLine } from './lines/parseLine';
import { shouldProcess } from './shouldProcess';
import { ExecutionCollector } from './tree/ExecutionCollector';
import { ExecutionTreeBuilder } from './tree/ExecutionTreeBuilder';
import { LimitSeriesCollector } from './tree/LimitSeriesCollector';

export const parserVersion = 4;

export class ApexLogParser {
  private readonly entryFactory = new EntryFactory();
  private readonly automationCollector = new AutomationCollector();
  private readonly executionCollector = new ExecutionCollector();
  private readonly limitSeriesCollector = new LimitSeriesCollector();
  private readonly treeBuilder = new ExecutionTreeBuilder(
    this.executionCollector,
    this.automationCollector
  );

  private lastReportedTime = 0;
  private processedLines = 0;
  private totalLines = 0;

  constructor(
    private readonly logText: string,
    private readonly options: ParseApexLogOptions = {}
  ) {}

  parse(): ApexLogProfile {
    const scanner = new LogLineScanner(this.logText);

    this.totalLines = scanner.scan(
      ({ raw, lineNumber }) => this.processLine(raw, lineNumber),
      this.options.onProgress
    );

    const profile: ApexLogProfile = {
      sourceName: this.options.sourceName,
      entries: this.treeBuilder.entries,
      rootIds: this.treeBuilder.rootIds,
      limits: this.limitSeriesCollector.limits,
      soqlExecutions: this.executionCollector.soqlExecutions,
      dmlExecutions: this.executionCollector.dmlExecutions,
      automation: { units: [], executions: [], elements: [] },
      insights: [],
      parserVersion,
      executionTime: this.lastReportedTime,
      totalLines: this.totalLines,
      processedLines: this.processedLines,
    };

    profile.insights = findProfileInsights(
      profile,
      this.options.performanceThresholds
    );
    profile.automation = finalizeAutomationInsights(
      this.automationCollector,
      profile.insights
    );

    return profile;
  }

  private processLine(rawLine: string, lineNumber: number) {
    if (lineNumber <= 1 || !shouldProcess(rawLine)) {
      return;
    }

    this.processedLines += 1;

    const parsedLine = parseLine(rawLine, lineNumber);

    if (parsedLine.time) {
      this.lastReportedTime = parsedLine.time;
    }

    const entry = this.entryFactory.create(
      parsedLine,
      this.treeBuilder.nextEntryId,
      this.treeBuilder.currentParent,
      this.lastReportedTime
    );

    this.automationCollector.recordEntry(entry);
    this.limitSeriesCollector.record(entry);
    this.treeBuilder.process(entry);
  }
}
