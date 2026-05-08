export function parsePaginationLimit(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed)) {
    return 10;
  }
  return Math.min(30, Math.max(1, parsed));
}

export function parsePaginationCursor(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed)) {
    return 0;
  }
  return Math.max(0, parsed);
}
