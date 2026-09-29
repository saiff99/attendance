import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const res = await fetchBackend('/api/upload-photo', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Error uploading photo' }, { status: 500 });
  }
}
