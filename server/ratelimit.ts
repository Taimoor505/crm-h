import type { Db } from './db';
import { ApiError } from './http';

/**
 * Fixed-window rate limit stored in Postgres (no Redis needed).
 * Throws 429 when `bucket` exceeded `limit` hits in the current window.
 */
export async function rateLimit(tx: Db, bucket: string, limit: number, windowSeconds = 60): Promise<void> {
  const [row] = await tx<{ count: number }[]>`
    insert into public.rate_limits (bucket, window_start, count)
    values (${bucket},
            to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds}),
            1)
    on conflict (bucket, window_start) do update set count = public.rate_limits.count + 1
    returning count`;
  if (row.count > limit) {
    throw new ApiError(429, 'rate_limited', 'Too many requests, slow down');
  }
}
