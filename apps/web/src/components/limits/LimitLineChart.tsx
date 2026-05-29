import type { LimitDetail } from '@sfdc-profiler/core';

export function LimitLineChart({
  executionTime,
  inputs,
}: {
  executionTime: number;
  inputs: LimitDetail[];
}) {
  if (inputs.length === 0) {
    return <p className="muted">No samples for this limit in the current log.</p>;
  }

  const chartWidth = 720;
  const chartHeight = 180;
  const padding = 24;
  const plotWidth = chartWidth - padding * 2;
  const plotHeight = chartHeight - padding * 2;
  const maxTime = Math.max(executionTime, ...inputs.map((input) => input.time), 1);
  const limitMax = Math.max(...inputs.map((input) => input.max), 1);
  const points = inputs.map((input) => {
    const x = padding + (input.time / maxTime) * plotWidth;
    const y = chartHeight - padding - (input.current / limitMax) * plotHeight;

    return {
      input,
      x,
      y,
    };
  });
  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPoints = [
    `${padding},${chartHeight - padding}`,
    polylinePoints,
    `${points.at(-1)?.x ?? padding},${chartHeight - padding}`,
  ].join(' ');

  return (
    <div className="limit-line-chart">
      <svg
        aria-label="Limit usage over transaction time"
        className="limit-line-chart-svg"
        role="img"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        <line
          className="limit-chart-axis"
          x1={padding}
          x2={chartWidth - padding}
          y1={chartHeight - padding}
          y2={chartHeight - padding}
        />
        <line
          className="limit-chart-axis"
          x1={padding}
          x2={padding}
          y1={padding}
          y2={chartHeight - padding}
        />
        <line
          className="limit-chart-grid"
          x1={padding}
          x2={chartWidth - padding}
          y1={padding}
          y2={padding}
        />
        <polygon className="limit-chart-area" points={areaPoints} />
        <polyline className="limit-chart-line" points={polylinePoints} />
        {points.map((point, index) => (
          <circle
            className="limit-chart-point"
            cx={point.x}
            cy={point.y}
            key={`${point.input.name}-${point.input.time}-${index}`}
            r="3.5"
          >
            <title>
              {point.input.time} ms: {point.input.current} / {point.input.max}
            </title>
          </circle>
        ))}
      </svg>
      <div className="limit-chart-scale">
        <span>0 ms</span>
        <span>{maxTime} ms</span>
      </div>
      <div className="limit-chart-scale limit-chart-y-scale">
        <span>0</span>
        <span>{limitMax}</span>
      </div>
    </div>
  );
}
