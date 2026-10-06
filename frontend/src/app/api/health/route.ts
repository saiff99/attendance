import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetchBackend('/health', { 
      cache: 'no-store',
      signal: controller.signal 
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && (data.status === 'ok' || data.status === 'Online')) {
        return NextResponse.json({
          status: 'ok',
          online: true,
          ai_enabled: Boolean(data.ai_enabled),
        });
      }
    }
  } catch (e) {
    // Backend unreachable
  }

  return NextResponse.json(
    {
      status: 'offline',
      online: false,
      ai_enabled: false,
      detail: 'Backend AI Engine is currently offline or unreachable.',
    },
    { status: 503 }
  );
}

