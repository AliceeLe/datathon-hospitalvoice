/** Indian digit grouping, e.g. 2,42,85,900. */
export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  return value.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
