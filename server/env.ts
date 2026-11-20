// Server-side configuration. Read lazily so tests can set env before first use.

export const env = {
  /**
   * Postgres connection. SUPABASE_DB_URL / DATABASE_URL when set by hand;
   * POSTGRES_URL when the Supabase ↔ Vercel integration set it (transaction
   * pooler). Query parameters postgres.js doesn't understand are dropped.
   */
  get databaseUrl() {
    const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('Missing required environment variable SUPABASE_DB_URL (or DATABASE_URL / POSTGRES_URL)');
    return cleanDbUrl(url);
  },
  get supabaseUrl() {
    return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  },
  /** Legacy HS256 JWT secret. If unset, tokens are verified against the project's JWKS. */
  get supabaseJwtSecret() {
    return process.env.SUPABASE_JWT_SECRET ?? '';
  },
  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  },
  /** Public base URL of this app, used to build webhook URLs and embed snippets. */
  get appUrl() {
    return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  },
  get paymentProofsBucket() {
    return process.env.PAYMENT_PROOFS_BUCKET ?? 'payment-proofs';
  },
  get voiceNotesBucket() {
    return process.env.VOICE_NOTES_BUCKET ?? 'voice-notes';
  },
};

/** Keeps only sslmode from the query string (the integration adds e.g. supa=base-pooler.x). */
export function cleanDbUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const sslmode = u.searchParams.get('sslmode');
    u.search = '';
    if (sslmode) u.searchParams.set('sslmode', sslmode);
    return u.toString();
  } catch {
    return raw;
  }
}
