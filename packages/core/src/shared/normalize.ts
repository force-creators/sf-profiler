export function normalizeId(value: string | undefined): string {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  );
}

export function normalizeValue(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase();
}

export function normalizeSoqlQuery(query: string): string {
  return query
    .replace(/:[A-Za-z_$][\w$]*/g, ':?')
    .replace(/\b\d+(?:\.\d+)?\b/g, '?')
    .replace(/'[^']*'/g, "'?'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
