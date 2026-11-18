import { ImageResponse } from 'next/og';
import { brandForRequest } from '@/lib/server-branding';

/** App icon: brand color square with the logo initials. Badge: white glyph on transparent. */
export async function brandIcon(req: Request, size: number, variant: 'icon' | 'badge' = 'icon') {
  const b = await brandForRequest(req);
  const maskable = new URL(req.url).searchParams.has('maskable');
  if (variant === 'badge') {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: size * 0.5, fontWeight: 800 }}>
          {b.logoText.slice(0, 1)}
        </div>
      ),
      { width: size, height: size },
    );
  }
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: b.primary,
          color: b.onPrimary,
          fontSize: size * (maskable ? 0.32 : 0.42),
          fontWeight: 800,
          borderRadius: maskable ? 0 : size * 0.22,
          letterSpacing: -size * 0.01,
        }}
      >
        {b.logoText}
      </div>
    ),
    { width: size, height: size, headers: { 'cache-control': 'public, max-age=3600' } },
  );
}
