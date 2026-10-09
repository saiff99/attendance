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

    const files = formData.getAll('files') as Blob[];
    if (files.length > 10) {
      return NextResponse.json({ detail: 'Maximum 10 angle photos allowed per burst.' }, { status: 400 });
    }
    for (const f of files) {
      if (f.size > 6 * 1024 * 1024) {
        return NextResponse.json({ detail: 'Each burst photo must be under 6MB.' }, { status: 413 });
      }
      if (f.type && !f.type.startsWith('image/')) {
        return NextResponse.json({ detail: 'Only image files are permitted.' }, { status: 415 });
      }
    }

    const res = await fetchBackend(`/api/enroll-face-burst/${studentId}`, {
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
    console.error('Face enrollment error:', err);
    return NextResponse.json(
      { detail: err.message || 'Face enrollment AI engine unreachable. Please ensure your backend is running.' },
      { status: 500 }
    );
  }
}

