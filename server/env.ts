// Server-side configuration. Read lazily so tests can set env before first use.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  /** Direct Postgres connection (Supabase: Settings > Database > connection string). */
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  get supabaseUrl() {
    return process.env.SUPABASE_URL ?? '';
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
  get voiceNotesBucket() {
    return process.env.VOICE_NOTES_BUCKET ?? 'voice-notes';
  },
};
