import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const user = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const res = await fetchBackend('/api/cameras', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'private, max-age=15, stale-while-revalidate=60',
        },
      });
    }
  } catch {}

  return NextResponse.json(
    { count: 6, cameras: [] },
    {
      headers: {
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=60',
      },
    }
  );
}
