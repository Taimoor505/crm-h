import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'crm_session';
const PUBLIC = ['/login', '/suspended', '/dev'];

/**
 * Signed-out users go to /login before any app page renders. The cookie is a
 * presence flag only; the API still verifies the token on every request.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const signedIn = req.cookies.has(SESSION_COOKIE);

  if (pathname === '/') {
    return NextResponse.redirect(new URL(signedIn ? '/home' : '/login', req.url));
  }
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!signedIn) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the API, Next internals and static files.
  matcher: ['/((?!api|_next|embed|assets|icons|favicon|manifest|sw\\.js|swe-worker|mockServiceWorker\\.js|push-sw\\.js|.*\\.(?:png|svg|ico|jpg|webp|webmanifest|js|css|map|txt)$).*)'],
};
