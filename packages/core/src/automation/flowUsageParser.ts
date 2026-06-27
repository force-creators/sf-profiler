export type UsageSnapshot = Partial<
  Record<'cpuMs' | 'soqlQueries' | 'soqlRows' | 'dmlStatements' | 'dmlRows', number>
>;

export function parseFlowSnapshot(
  detail: string
): { metric: keyof UsageSnapshot; current: number } | undefined {
  return parseFlowUsage(detail, false);
}

export function parseFlowDelta(
  detail: string
): { metric: keyof UsageSnapshot; delta: number } | undefined {
  const parsed = parseFlowUsage(detail, true);

  return parsed ? { metric: parsed.metric, delta: parsed.delta ?? 0 } : undefined;
}

function parseFlowUsage(
  detail: string,
  isDelta: boolean
):
  | { metric: keyof UsageSnapshot; current: number; delta?: number }
  | undefined {
  const metric = getFlowMetricKey(detail);

  if (!metric) {
    return undefined;
  }

  if (isDelta) {
    const totalIndex = detail.indexOf(', total ');

    if (totalIndex === -1) {
      return undefined;
    }

    const deltaValue = Number.parseInt(detail.slice(0, detail.indexOf(' ')), 10);
    const totalValue = Number.parseInt(
      detail.slice(totalIndex + ', total '.length),
      10
    );

    if (Number.isNaN(deltaValue) || Number.isNaN(totalValue)) {
      return undefined;
    }

    return {
      metric,
      current: totalValue,
      delta: deltaValue,
    };
  }

  const separatorIndex = detail.indexOf(': ');
  const outOfIndex = detail.indexOf(' out of ', separatorIndex + 2);

  if (separatorIndex === -1 || outOfIndex === -1) {
    return undefined;
  }

  const current = Number.parseInt(
    detail.slice(separatorIndex + 2, outOfIndex),
    10
  );

  if (Number.isNaN(current)) {
    return undefined;
  }

  return {
    metric,
    current,
  };
}

function getFlowMetricKey(detail: string): keyof UsageSnapshot | undefined {
  if (detail.includes('CPU time')) {
    return 'cpuMs';
  }

  if (detail.includes('SOQL query rows')) {
    return 'soqlRows';
  }

  if (detail.includes('SOQL queries')) {
    return 'soqlQueries';
  }

  if (detail.includes('DML statements')) {
    return 'dmlStatements';
  }

  if (detail.includes('DML rows')) {
    return 'dmlRows';
  }

  return undefined;
}
