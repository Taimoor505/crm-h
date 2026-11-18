import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recreates the test database: Supabase shim, then every migration in order,
 * exactly as `supabase db push` would apply them. Requires psql and a local
 * PostgreSQL 15+ (TEST_DATABASE_URL, default postgres:postgres@localhost/crm_test).
 */
export default function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/crm_test');
  const dbName = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const psql = (target: string, args: string[]) =>
    execFileSync('psql', [target, '-v', 'ON_ERROR_STOP=1', '-q', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });

  psql(admin.toString(), ['-c', `drop database if exists ${dbName} with (force)`, '-c', `create database ${dbName}`]);
  psql(url.toString(), ['-f', join('supabase', 'tests', '00_supabase_shim.sql')]);
  const dir = join('supabase', 'migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    psql(url.toString(), ['-f', join(dir, f)]);
  }
}
