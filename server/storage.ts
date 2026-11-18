import { env } from './env';

export interface StorageDriver {
  upload(bucket: string, path: string, body: Blob, contentType: string): Promise<{ path: string }>;
}

/** Supabase Storage over its REST API, using the service role key. */
const supabaseStorage: StorageDriver = {
  async upload(bucket, path, body, contentType) {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for uploads');
    }
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.supabaseServiceRoleKey}`,
        'content-type': contentType,
        'x-upsert': 'false',
      },
      body,
    });
    if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`);
    return { path: `${bucket}/${path}` };
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
