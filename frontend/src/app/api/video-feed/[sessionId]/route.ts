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
