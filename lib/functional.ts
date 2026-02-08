export function range(start: number, end: number): number[] {
  if (end < start) return [];
  const len = end - start + 1;
  return Array.from({ length: len }, (_, i) => start + i);
}

export async function mapSeries<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  // eslint-disable-next-line no-restricted-syntax
  for (let i = 0; i < items.length; i++) {
    // sequential on purpose
    // eslint-disable-next-line no-await-in-loop
    results.push(await fn(items[i], i));
  }
  return results;
}

export async function forEachSeries<T>(items: T[], fn: (item: T, index: number) => Promise<void>): Promise<void> {
  // eslint-disable-next-line no-restricted-syntax
  for (let i = 0; i < items.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    await fn(items[i], i);
  }
}
