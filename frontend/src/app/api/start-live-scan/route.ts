import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';
import { requireRoles } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = await requireRoles(request, ['Super Admin', 'Faculty']);
    if (auth.errorResponse) {
      return NextResponse.json(auth.errorResponse.body, { status: auth.errorResponse.status });
    }

    const body = await request.json();
    const res = await fetchBackend('/api/start-live-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error starting live scan';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
