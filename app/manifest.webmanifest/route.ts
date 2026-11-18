import { brandForRequest } from '@/lib/server-branding';

/** PWA manifest from branding (name, short_name, theme_color, icons). */
export async function GET(req: Request) {
  const b = await brandForRequest(req);
  const manifest = {
    name: b.appName,
    short_name: b.shortName,
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: b.primary,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' },
  });
}
