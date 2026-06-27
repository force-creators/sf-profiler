import { describe, expect, it } from 'vitest';
import { LogLineScanner } from '../src/parser/lines/LogLineScanner';

describe('LogLineScanner', () => {
  it('scans CRLF log text and reports progress like the parser loop', () => {
    const lines: Array<{ raw: string; lineNumber: number; progress: number }> =
      [];
    const progress: number[] = [];
    const scanner = new LogLineScanner('header\r\nbody\r\n');

    const totalLines = scanner.scan(
      (line) => lines.push(line),
      (value) => progress.push(value)
    );

    expect(totalLines).toBe(3);
    expect(lines).toEqual([
      { raw: 'header', lineNumber: 1, progress: 50 },
      { raw: 'body', lineNumber: 2, progress: 93 },
      { raw: '', lineNumber: 3, progress: 100 },
    ]);
    expect(progress).toEqual([50, 93, 100]);
  });
});
