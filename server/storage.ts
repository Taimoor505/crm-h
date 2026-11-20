import { env } from './env';

export interface StorageDriver {
  upload(bucket: string, path: string, body: Blob, contentType: string): Promise<{ path: string }>;
  /** Temporary download link for a private object ("bucket/path"). */
  signedUrl(objectPath: string, expiresInSeconds: number): Promise<string>;
}

/** New sb_secret_ keys go in `apikey` only; legacy service_role JWTs in both. */
function keyHeaders(): Record<string, string> {
  const key = env.supabaseServiceRoleKey;
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };
}

/** Supabase Storage over its REST API, using the service role key. */
const supabaseStorage: StorageDriver = {
  async upload(bucket, path, body, contentType) {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for uploads');
    }
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: { ...keyHeaders(), 'content-type': contentType, 'x-upsert': 'false' },
      body,
    });
    if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`);
    return { path: `${bucket}/${path}` };
  },
  async signedUrl(objectPath, expiresInSeconds) {
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/sign/${objectPath}`, {
      method: 'POST',
      headers: { ...keyHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    const body = (await res.json().catch(() => ({}))) as { signedURL?: string };
    if (!res.ok || !body.signedURL) throw new Error(`Storage sign failed: ${res.status}`);
    return `${env.supabaseUrl}/storage/v1${body.signedURL}`;
  },
};

let driver: StorageDriver = supabaseStorage;

export function storage(): StorageDriver {
  return driver;
}

/** Tests swap in an in-memory driver. */
export function setStorageDriver(d: StorageDriver) {
  driver = d;
}
