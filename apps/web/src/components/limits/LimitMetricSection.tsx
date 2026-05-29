import type { LimitDetail } from '@sfdc-profiler/core';
import { LimitHeaderMetric } from './LimitHeaderMetric';
import { LimitLineChart } from './LimitLineChart';

export function LimitMetricSection({
  executionTime,
  inputs,
  label,
}: {
  executionTime: number;
  inputs: LimitDetail[];
  label: string;
}) {
  const latest = inputs.at(-1);
  const maxLimit =
    inputs.length > 0
      ? inputs.reduce((largest, input) => (input.max > largest.max ? input : largest))
          .max
      : undefined;
  const peak =
    inputs.length > 0
      ? inputs.reduce((largest, input) =>
          input.current > largest.current ? input : largest
        )
      : undefined;

  return (
    <section className="limit-metric-section">
      <header className="limit-metric-header">
        <h4>{label}</h4>
        <div className="limit-section-metrics">
          <LimitHeaderMetric
            label="Latest"
            value={latest ? `${latest.current}` : '-'}
          />
          <LimitHeaderMetric
            label="Peak"
            value={peak ? `${peak.current}` : '-'}
          />
          <LimitHeaderMetric label="Limit" value={maxLimit ? `${maxLimit}` : '-'} />
        </div>
      </header>
      <LimitLineChart executionTime={executionTime} inputs={inputs} />
    </section>
  );
}
