import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as Blob | null;
    if (file) {
      if (file.size > 6 * 1024 * 1024) {
        return NextResponse.json({ detail: 'Enrollment photo too large (Max 6MB).' }, { status: 413 });
      }
      if (file.type && !file.type.startsWith('image/')) {
        return NextResponse.json({ detail: 'Only image files are permitted.' }, { status: 415 });
      }
    }

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

