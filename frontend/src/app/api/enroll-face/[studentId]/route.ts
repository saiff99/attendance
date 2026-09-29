import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId } = await params;
    const formData = await request.formData();

    const res = await fetchBackend(`/api/enroll-face/${studentId}`, {
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
    console.error('Face enrollment single error:', err);
    return NextResponse.json(
      { detail: err.message || 'Face enrollment AI engine unreachable.' },
      { status: 500 }
    );
  }
}

