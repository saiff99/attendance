import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from './lib/serverAuth';

// Public routes accessible without logging in
const PUBLIC_PATHS = [
  '/login',
  '/self-attendance',
  '/selfieattend',
  '/manifest.json',
  '/manifest.webmanifest',
  '/sw.js',
  '/api/auth/login',
  '/api/selfie-attendance',
  '/api/active-sessions',
  '/api/health',
  '/api/student-lookup',
  '/api/geofence',
];

// Strict static asset file extension regex (prevents path bypass like /api/video-feed/a.b)
const STATIC_ASSET_REGEX = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|json|webmanifest|woff|woff2|ttf|eot)$/i;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip Next.js internal files, static assets, and favicon
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    STATIC_ASSET_REGEX.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 2. Check if the path is whitelisted as public
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  // 3. Verify session token from HttpOnly cookie
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = sessionToken ? await verifySessionToken(sessionToken) : null;
  const isAuthenticated = Boolean(user);

  // 4. Block or redirect unauthenticated requests
  if (!isAuthenticated && !isPublic) {
    // For API requests, return 401 Unauthorized JSON instead of HTML redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication session required.' },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 5. Redirect already authenticated users from /login
  if (isAuthenticated && pathname === '/login') {
    if (user?.role === 'Student') {
      return NextResponse.redirect(new URL('/portal', request.url));
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 6. Enforce Student Role Isolation: Students can only access /portal, /selfieattend, /self-attendance, and allowed student APIs
  if (isAuthenticated && user?.role === 'Student') {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/portal', request.url));
    }
    const adminRestrictedPaths = ['/live-scan', '/ongoing', '/students', '/users', '/audit-logs', '/reports'];
    if (adminRestrictedPaths.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }

    // Block all administrative backend and hardware control APIs from Student invocation
    const adminRestrictedApis = [
      '/api/ptz',
      '/api/whatsapp',
      '/api/start-live-scan',
      '/api/process-attendance',
      '/api/users',
      '/api/audit-logs',
      '/api/cameras',
      '/api/ptz-cameras',
      '/api/ptz-video-feed',
      '/api/video-feed',
      '/api/enroll-face',
      '/api/enroll-face-burst',
      '/api/upload-photo',
      '/api/logs',
    ];
    if (adminRestrictedApis.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin or Faculty privileges required.' },
        { status: 403 }
      );
    }

    // Block Students from modifying campus geofence configuration
    if (pathname === '/api/geofence' && request.method !== 'GET') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin privileges required to update geofence.' },
        { status: 403 }
      );
    }
  }

  // 7. Restrict /audit-logs and /api/audit-logs strictly to Super Admin role
  if ((pathname.startsWith('/audit-logs') || pathname.startsWith('/api/audit-logs')) && user?.role !== 'Super Admin') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Super Admin access required for audit logs.' },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
