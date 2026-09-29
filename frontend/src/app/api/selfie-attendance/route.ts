import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const res = await fetchBackend('/api/selfie-attendance', {
      method: 'POST',
      body: formData,
    });

    let data;
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => '');
      data = { detail: text || `Upstream returned status ${res.status}` };
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Selfie attendance error:', err);
    return NextResponse.json(
      { detail: err.message || 'Face verification service unavailable.' },
      { status: 500 }
    );
  }
}

