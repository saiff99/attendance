import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';
import { requireRoles } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = await requireRoles(req, ['Super Admin', 'Admin', 'Faculty']);
    if (auth.errorResponse) {
      return NextResponse.json(auth.errorResponse.body, { status: auth.errorResponse.status });
    }

    const res = await fetchBackend('/api/whatsapp/status', {
      method: 'GET',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, status: 'disconnected', error: error.message || 'WhatsApp bridge offline' },
      { status: 500 }
    );
  }
}
