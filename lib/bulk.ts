/**
 * Runs one request per item with limited concurrency. Used for bulk actions
 * until the backend has POST /contacts/bulk (docs/frontend-endpoint-map.md).
 */
export async function runBulk<T>(items: T[], fn: (item: T) => Promise<unknown>, concurrency = 4): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      try {
        await fn(item);
        ok++;
      } catch {
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { ok, failed };
}
