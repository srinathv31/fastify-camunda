/**
 * Add a number of days to a date and return a new Date instance. This
 * utility does not mutate the original date.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Compute the difference in full days between two dates. The result is
 * positive if `later` is after `earlier` and negative otherwise.
 */
export function diffInDays(later: Date, earlier: Date): number {
  const diffMs = later.getTime() - earlier.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}