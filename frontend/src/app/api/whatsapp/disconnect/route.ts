import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';
import { requireRoles } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireRoles(req, ['Super Admin']);
    if (auth.errorResponse) {
      return NextResponse.json(auth.errorResponse.body, { status: auth.errorResponse.status });
    }

    const res = await fetchBackend('/api/whatsapp/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to disconnect WhatsApp' },
      { status: 500 }
    );
  }
}
