import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const cameraIndex = searchParams.get('camera_index') || '0';
    const grid = searchParams.get('grid') ?? '0';

    const path = `/api/ptz-video-feed/${sessionId}?camera_index=${cameraIndex}&grid=${grid}`;
    const res = await fetchBackend(path, { cache: 'no-store' });

    if (!res.ok || !res.body) {
      return new Response('PTZ stream unavailable', { status: 502 });
    }

    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    return new Response('Backend PTZ error', { status: 502 });
  }
}
