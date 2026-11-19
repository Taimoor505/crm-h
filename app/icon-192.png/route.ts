import { brandIcon } from '@/lib/icon-image';

// Expected by public/push-sw.js and the web manifest.
export async function GET(req: Request) {
  return brandIcon(req, 192, 'icon');
}
