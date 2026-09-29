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

    const res = await fetchBackend(`/api/enroll-face-burst/${studentId}`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Face enrollment error:', err);
    return NextResponse.json(
      { detail: err.message || 'Face enrollment AI engine unreachable. Please ensure the backend is running.' },
      { status: 500 }
    );
  }
}
