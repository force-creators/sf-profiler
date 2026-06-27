export type ScannedLogLine = {
  raw: string;
  lineNumber: number;
  progress: number;
};

export class LogLineScanner {
  constructor(private readonly logText: string) {}

  scan(
    onLine: (line: ScannedLogLine) => void,
    onProgress?: (progress: number) => void
  ): number {
    let lastProgress = 0;
    let lineNumber = 0;
    let lineStart = 0;

    while (lineStart <= this.logText.length) {
      const newlineIndex = this.logText.indexOf('\n', lineStart);
      const lineEnd = newlineIndex === -1 ? this.logText.length : newlineIndex;
      const raw = trimTrailingCarriageReturn(
        this.logText.slice(lineStart, lineEnd)
      );

      lineNumber += 1;

      const progress = Math.ceil(
        (lineEnd / Math.max(this.logText.length, 1)) * 100
      );

      onLine({ raw, lineNumber, progress });

      if (progress !== lastProgress) {
        onProgress?.(progress);
        lastProgress = progress;
      }

      if (newlineIndex === -1) {
        break;
      }

      lineStart = newlineIndex + 1;
    }

    return lineNumber;
  }
}

function trimTrailingCarriageReturn(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}
