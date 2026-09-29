import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const res = await fetchBackend('/api/selfie-attendance', {
      method: 'POST',
      body: formData,
    });

    let data: any;
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => '');
      let fallbackDetail = text;
      if (!fallbackDetail || fallbackDetail.includes('<html')) {
        if (res.status === 503 || res.status === 502) {
          fallbackDetail = "Face verification AI server is temporarily busy or reconnecting. Please tap 'Try Selfie Again'.";
        } else {
          fallbackDetail = `Server returned status ${res.status}`;
        }
      }
      data = { detail: fallbackDetail };
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


