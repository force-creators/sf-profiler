export function LimitHeaderMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="limit-header-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
