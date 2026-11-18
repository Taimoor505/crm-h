import postgres, { type ISql, type TransactionSql } from 'postgres';
import { env } from './env';

/**
 * One pool per process. Every request runs in a transaction that sets the
 * Postgres role and JWT claims exactly as Supabase's PostgREST does, so the
 * RLS policies (auth.uid(), is_workspace_member, ...) apply to our API too.
 */
let pool: postgres.Sql | null = null;

export function db(): postgres.Sql {
  if (!pool) {
    pool = postgres(env.databaseUrl, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      // Supabase's transaction pooler (port 6543) does not support prepared statements.
      prepare: !/:6543\//.test(env.databaseUrl),
      onnotice: () => {},
    });
  }
  return pool;
}

export async function closeDb() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end({ timeout: 5 });
  }
}

export type Tx = TransactionSql;
export type Db = ISql;

/** Runs fn as the signed-in user: role `authenticated`, RLS enforced. */
export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx.unsafe('set local role authenticated');
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: userId,
      role: 'authenticated',
    })}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

/** Runs fn as service_role: RLS bypassed. Callers must authorise themselves. */
export function withService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx.unsafe('set local role service_role');
    return fn(tx);
  }) as Promise<T>;
}

/**
 * Switches an open user transaction to service_role. Use after the handler
 * has done its own permission checks, for work that must see rows the user
 * can't (e.g. duplicate-phone lookup across other agents' contacts).
 */
export async function elevate(tx: Tx): Promise<void> {
  await tx.unsafe('set local role service_role');
}

/**
 * A jsonb query parameter. Always use this rather than JSON.stringify(...):
 * postgres.js v4 would store a pre-stringified value as a JSON *string*.
 */
export function jsonb(tx: Db, value: unknown) {
  return tx.json(value as postgres.JSONValue);
}
