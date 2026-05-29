import { limitTypes, type LimitDetail } from './limits';
import type { ApexLogEntry, LogEntryType } from './types';

const apexTags = /METHOD_ENTRY|METHOD_EXIT/;
const workflowKeywords = /Workflow:/;
const workflowTags =
  /WF_CRITERIA_BEGIN|WF_CRITERIA_END|FLOW_START_INTERVIEW_BEGIN|FLOW_START_INTERVIEW_END|WF_RULE_EVAL_BEGIN|WF_RULE_EVAL_END|WF_RULE_NOT_EVALUATED|FLOW_CREATE_INTERVIEW_END|\|FLOW_INTERVIEW_FINISHED\|/;
const dmlTags = /DML_BEGIN|DML_END/;
const soqlTags = /SOQL_EXECUTE_BEGIN|SOQL_EXECUTE_END/;

export class ApexLogLine implements ApexLogEntry {
  static lastReportedTime = 0;

  logLine: string;
  event: string;
  type: LogEntryType;
  detail: string;
  id: number;
  index: number;
  lineNumber: number;
  children: number[];
  parentIndex: number;
  parentId?: number;
  time: number;
  nano: number;
  duration?: number;
  endTime?: number;
  endLineNumber?: number;
  limitDetail?: LimitDetail;

  private logLineSplit: string[];

  constructor(index: number, parentIndex: number, logLine: string) {
    this.id = index;
    this.index = index;
    this.lineNumber = index;
    this.parentIndex = parentIndex;
    this.parentId = parentIndex >= 0 ? parentIndex : undefined;
    this.logLine = logLine;
    this.logLineSplit = this.logLine.split('|', 2);
    this.children = [];

    const timeSplit = this.logLineSplit[0]?.split(' ') ?? [];
    this.nano = Number.parseInt(
      timeSplit[1]?.substring(1, timeSplit[1].length - 1) ?? '0',
      10
    );
    this.time = this.nanoToMs(this.nano);

    if (this.time) {
      ApexLogLine.lastReportedTime = this.time;
    }

    this.event = this.logLineSplit[1] ?? '';
    this.detail = this.getDetailValue();
    this.type = this.classifyType();

    if (this.type === 'limit') {
      this.limitDetail = this.parseLimit();
    }
  }

  endParent(endLine: ApexLogLine) {
    this.duration = endLine.time - this.time;
    this.endTime = endLine.time;
    this.endLineNumber = endLine.lineNumber;
  }

  toJSON(): ApexLogEntry {
    return {
      id: this.id,
      logLine: this.logLine,
      event: this.event,
      type: this.type,
      detail: this.detail,
      lineNumber: this.lineNumber,
      children: this.children,
      parentId: this.parentId,
      time: this.time,
      nano: this.nano,
      duration: this.duration,
      endTime: this.endTime,
      endLineNumber: this.endLineNumber,
      limitDetail: this.limitDetail,
    };
  }

  private parseLimit(): LimitDetail | undefined {
    const spaceSplit = this.logLine.trimStart().split(/\s+/);

    if (this.logLine.includes('Number of ')) {
      switch (spaceSplit[2]) {
        case 'SOQL':
          return {
            name: limitTypes.soqlQueries,
            current: Number.parseInt(spaceSplit[4] ?? '0', 10),
            max: Number.parseInt(spaceSplit[7] ?? '0', 10),
            time: ApexLogLine.lastReportedTime,
          };
        case 'query':
          return {
            name: limitTypes.soqlQueryRows,
            current: Number.parseInt(spaceSplit[4] ?? '0', 10),
            max: Number.parseInt(spaceSplit[7] ?? '0', 10),
            time: ApexLogLine.lastReportedTime,
          };
        case 'DML':
          return {
            name:
              spaceSplit[3] === 'statements:'
                ? limitTypes.dmlStatements
                : limitTypes.dmlRows,
            current: Number.parseInt(spaceSplit[4] ?? '0', 10),
            max: Number.parseInt(spaceSplit[7] ?? '0', 10),
            time: ApexLogLine.lastReportedTime,
          };
        case 'Publish':
          return {
            name: limitTypes.dmlPublishImmediate,
            current: Number.parseInt(spaceSplit[5] ?? '0', 10),
            max: Number.parseInt(spaceSplit[8] ?? '0', 10),
            time: ApexLogLine.lastReportedTime,
          };
        case 'callouts:':
          return {
            name: limitTypes.callouts,
            current: Number.parseInt(spaceSplit[3] ?? '0', 10),
            max: Number.parseInt(spaceSplit[6] ?? '0', 10),
            time: ApexLogLine.lastReportedTime,
          };
        case 'future':
          return {
            name: limitTypes.future,
            current: Number.parseInt(spaceSplit[4] ?? '0', 10),
            max: Number.parseInt(spaceSplit[7] ?? '0', 10),
            time: ApexLogLine.lastReportedTime,
          };
        case 'queueable':
          return {
            name: limitTypes.queueable,
            current: Number.parseInt(spaceSplit[8] ?? '0', 10),
            max: Number.parseInt(spaceSplit[11] ?? '0', 10),
            time: ApexLogLine.lastReportedTime,
          };
        default:
          return undefined;
      }
    }

    if (this.logLine.includes('Maximum ')) {
      return {
        name:
          spaceSplit[1] === 'CPU' ? limitTypes.cpuTime : limitTypes.heapSize,
        current: Number.parseInt(spaceSplit[3] ?? '0', 10),
        max: Number.parseInt(spaceSplit[6] ?? '0', 10),
        time: ApexLogLine.lastReportedTime,
      };
    }

    return undefined;
  }

  private nanoToMs(nanoSeconds: number): number {
    return Math.floor(nanoSeconds / 1000000);
  }

  private getDetailValue(): string {
    if (this.logLine.includes('__sfdc_trigger')) {
      return this.logLine
        .substring(this.logLine.lastIndexOf(' ') + 1)
        .replace('__sfdc_trigger', '');
    }

    if (this.event === 'WF_CRITERIA_BEGIN') {
      return this.logLine.split('|')[3] ?? '';
    }

    if (this.event === 'DML_BEGIN') {
      const lineDetails = this.logLine.split('|');
      return [lineDetails[3], lineDetails[4], lineDetails[5]]
        .filter(Boolean)
        .join(', ');
    }

    return this.logLine.substring(this.logLine.lastIndexOf('|') + 1);
  }

  private classifyType(): LogEntryType {
    if (apexTags.test(this.event) || this.logLine.includes('__sfdc_trigger')) {
      return 'apex';
    }

    if (workflowKeywords.test(this.detail) || workflowTags.test(this.event)) {
      return 'workflow';
    }

    if (dmlTags.test(this.event)) {
      return 'dml';
    }

    if (soqlTags.test(this.event)) {
      return 'soql';
    }

    if (
      this.event === 'LIMIT_USAGE' ||
      this.logLine.includes('Number of ') ||
      this.logLine.includes('Maximum ')
    ) {
      return 'limit';
    }

    return 'other';
  }
}
