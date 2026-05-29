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
      : Number.parseInt(raw.slice(openParenIndex + 1, closeParenIndex), 10) || 0;

  return {
    raw,
    lineNumber,
    event,
    time: Math.floor(nano / 1000000),
    nano,
  };
}

export function getDetailValue(line: ParsedLine): string {
  if (line.raw.includes('__sfdc_trigger')) {
    return line.raw
      .substring(line.raw.lastIndexOf(' ') + 1)
      .replace('__sfdc_trigger', '');
  }

  if (line.event === 'WF_CRITERIA_BEGIN') {
    return field(line.raw, 3);
  }

  if (line.event === 'DML_BEGIN') {
    return [field(line.raw, 3), field(line.raw, 4), field(line.raw, 5)]
      .filter(Boolean)
      .join(', ');
  }

  const lastPipeIndex = line.raw.lastIndexOf('|');
  return lastPipeIndex === -1 ? '' : line.raw.slice(lastPipeIndex + 1);
}

export function field(raw: string, fieldIndex: number): string {
  let currentFieldIndex = 0;
  let fieldStart = 0;

  for (let index = 0; index <= raw.length; index += 1) {
    if (index !== raw.length && raw.charCodeAt(index) !== 124) {
      continue;
    }

    if (currentFieldIndex === fieldIndex) {
      return raw.slice(fieldStart, index);
    }

    currentFieldIndex += 1;
    fieldStart = index + 1;
  }

  return '';
}

export function parseBracketedLineNumber(value: string): number | undefined {
  if (value.charCodeAt(0) !== 91) {
    return undefined;
  }

  const line = Number.parseInt(value.slice(1, value.length - 1), 10);
  return Number.isNaN(line) ? undefined : line;
}

export function parseLabeledNumber(
  value: string,
  label: string
): number | undefined {
  if (!value.startsWith(label)) {
    return undefined;
  }

  const number = Number.parseInt(value.slice(label.length), 10);
  return Number.isNaN(number) ? undefined : number;
}

export function parseLabeledText(
  value: string,
  label: string
): string | undefined {
  if (!value.startsWith(label)) {
    return value || undefined;
  }

  return value.slice(label.length) || undefined;
}

export function parseExplainNumber(
  value: string,
  label: string
): number | undefined {
  const labelIndex = value.indexOf(label);

  if (labelIndex === -1) {
    return undefined;
  }

  const numberStart = labelIndex + label.length;
  const separatorOffset = value[numberStart] === ' ' ? 1 : 0;
  const number = Number.parseFloat(value.slice(numberStart + separatorOffset));
  return Number.isNaN(number) ? undefined : number;
}

export function trimTrailingCarriageReturn(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}
