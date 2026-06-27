export type ParsedLine = {
  raw: string;
  lineNumber: number;
  event: string;
  time: number;
  nano: number;
};

export function parseLine(raw: string, lineNumber: number): ParsedLine {
  const firstPipeIndex = raw.indexOf('|');
  const eventStart = firstPipeIndex === -1 ? raw.length : firstPipeIndex + 1;
  const secondPipeIndex = raw.indexOf('|', eventStart);
  const event =
    firstPipeIndex === -1
      ? ''
      : raw.slice(
          eventStart,
          secondPipeIndex === -1 ? raw.length : secondPipeIndex
        );
  const openParenIndex = raw.indexOf('(');
  const closeParenIndex =
    openParenIndex === -1 ? -1 : raw.indexOf(')', openParenIndex + 1);
  const nano =
    openParenIndex === -1 || closeParenIndex === -1
      ? 0
      : Number.parseInt(raw.slice(openParenIndex + 1, closeParenIndex), 10) ||
        0;

  return {
    raw,
    lineNumber,
    event,
    time: Math.floor(nano / 1000000),
    nano,
  };
}
