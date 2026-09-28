import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    // 1. Forward to local FastAPI backend (port 8000)
    try {
      const res = await fetch('http://127.0.0.1:8000/api/process-attendance', {
        method: 'POST',
        headers: { 'ngrok-skip-browser-warning': '69420' },
        body: formData,
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch (e) {
      // 2. Fallback to Ngrok if local fails
      const res = await fetch('https://silly-unframed-extortion.ngrok-free.dev/api/process-attendance', {
        method: 'POST',
        headers: { 'ngrok-skip-browser-warning': '69420' },
        body: formData,
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || 'Face processing service unavailable.' },
      { status: 500 }
    );
  }
}
