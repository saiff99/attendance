import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob | null;
    if (file) {
      if (file.size > 6 * 1024 * 1024) {
        return NextResponse.json({ detail: 'Image too large (Max 6MB).' }, { status: 413 });
      }
      if (file.type && !file.type.startsWith('image/')) {
        return NextResponse.json({ detail: 'Only image files are permitted.' }, { status: 415 });
      }
    }
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
