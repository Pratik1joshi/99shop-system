import { NextResponse } from 'next/server';

// The one public address search engines should see, once the real domain is configured.
const CANONICAL = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || '');
    return /example\.(com|org)$/.test(url.hostname) ? null : url;
  } catch {
    return null;
  }
})();
const bareHost = (host) => host.replace(/^www\./, '');

/**
 * 301 www <-> non-www and http -> https onto the canonical origin. Only hosts
 * that are a variant of the canonical domain are touched, so internal proxy
 * hosts (localhost, the cPanel upstream) can never loop.
 */
function canonicalRedirect(request) {
  if (!CANONICAL || process.env.NODE_ENV !== 'production') return null;
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim().toLowerCase();
  const proto = (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim();
  if (!host || bareHost(host) !== bareHost(CANONICAL.host)) return null;
  if (host === CANONICAL.host && !(proto === 'http' && CANONICAL.protocol === 'https:')) return null;
  return NextResponse.redirect(new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, CANONICAL.origin), 301);
}

/**
 * Security headers + landing rewrite + legacy-role route guard.
 */
export async function middleware(request) {
  const { pathname } = request.nextUrl;

  const canonical = canonicalRedirect(request);
  if (canonical) return canonical;

  // Shop and product addresses are lower-case; /Shop/Hair-Clips should not be a second copy.
  if (/^\/(shop|products)\//i.test(pathname) && pathname !== pathname.toLowerCase()) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.toLowerCase();
    return NextResponse.redirect(url, 301);
  }

  // The public landing is served by the route-group page at app/(public)/page.jsx.
  const response = NextResponse.next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // camera=(self) so the POS barcode scanner can use the device camera.
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  response.headers.set('X-XSS-Protection', '0');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  // Allow landing page images, fonts, Google Maps, and Vercel Live feedback script / analytics
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self' https://vercel.live https://*.vercel.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.vercel.com https://*.vercel-insights.com https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://vercel.live https://*.vercel.com",
      "img-src 'self' data: blob: https: https://vercel.live https://*.vercel.com",
      "font-src 'self' data: https://fonts.gstatic.com https://vercel.live https://*.vercel.com",
      "connect-src 'self' https://vercel.live https://*.vercel.com https://*.vercel-insights.com https://vitals.vercel-insights.com wss://*.vercel.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
      "frame-src 'self' https://www.google.com https://maps.google.com https://*.google.com https://www.youtube-nocookie.com https://player.vimeo.com https://vercel.live https://*.vercel.com",
      "frame-ancestors 'self' https://vercel.live https://*.vercel.com",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  return response;
}

export const config = {
  // Skip Next internals + static public assets (icons/images/html/manifest).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg|html|txt|xml|webmanifest|js|css|map|woff2?)$).*)',
  ],
};
