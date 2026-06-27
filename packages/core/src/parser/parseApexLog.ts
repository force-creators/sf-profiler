import type { ApexLogProfile, ParseApexLogOptions } from '../types';
import { ApexLogParser } from './ApexLogParser';

export { parserVersion } from './ApexLogParser';

export function parseApexLog(
  logText: string,
  options: ParseApexLogOptions = {}
): ApexLogProfile {
  return new ApexLogParser(logText, options).parse();
}
