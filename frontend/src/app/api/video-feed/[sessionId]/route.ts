import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    // Defense-in-depth: In-route session token verification
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const user = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!user) {
      return new Response('Unauthorized: Login required to view camera feed.', { status: 401 });
    }

    const { sessionId } = await params;
    if (!sessionId || sessionId.length < 8) {
      return new Response('Invalid session ID', { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const cameraIndex = searchParams.get('camera_index') || '0';
    const grid = searchParams.get('grid') ?? '1';

    const path = `/api/video-feed/${sessionId}?camera_index=${cameraIndex}&grid=${grid}`;
    const res = await fetchBackend(path, { cache: 'no-store', signal: request.signal });

    if (!res.ok || !res.body) {
      return new Response('Camera stream unavailable', { status: 502 });
    }

    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    return new Response('Backend stream error', { status: 502 });
  }
}
