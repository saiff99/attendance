import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetchBackend('/health', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json().catch(() => ({ status: 'ok', ai_enabled: true }));
      return NextResponse.json(data);
    }
  } catch (e) {}

  return NextResponse.json({ status: 'ok', ai_enabled: true });
}

