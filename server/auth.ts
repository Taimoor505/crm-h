import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { env } from './env';
import { ApiError } from './http';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** Verifies a Supabase Auth access token and returns the user id (sub). */
export async function verifyAccessToken(token: string): Promise<{ userId: string; claims: JWTPayload }> {
  try {
    let payload: JWTPayload;
    if (env.supabaseJwtSecret) {
      ({ payload } = await jwtVerify(token, new TextEncoder().encode(env.supabaseJwtSecret), {
        audience: 'authenticated',
      }));
    } else {
      if (!env.supabaseUrl) throw new Error('SUPABASE_URL or SUPABASE_JWT_SECRET must be set');
      jwks ??= createRemoteJWKSet(new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`));
      ({ payload } = await jwtVerify(token, jwks, { audience: 'authenticated' }));
    }
    if (!payload.sub) throw new Error('token has no sub');
    return { userId: payload.sub, claims: payload };
  } catch {
    throw new ApiError(401, 'unauthorized', 'Invalid or expired access token');
  }
}

export function bearerToken(req: Request): string {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) throw new ApiError(401, 'unauthorized', 'Missing Authorization: Bearer token');
  return m[1].trim();
}
