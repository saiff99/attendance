import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    try {
      const res = await fetch('http://127.0.0.1:8000/api/start-live-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch (e) {
      const res = await fetch('https://silly-unframed-extortion.ngrok-free.dev/api/start-live-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Error starting live scan' }, { status: 500 });
  }
}
