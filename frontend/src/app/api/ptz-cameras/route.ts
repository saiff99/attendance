import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetchBackend('/api/ptz-cameras', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (e) {}

  return NextResponse.json({ count: 1 });
}
