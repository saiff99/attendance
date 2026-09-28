import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const res = await fetch(`http://127.0.0.1:8000/api/logs/${sessionId}`, {
      headers: { 'ngrok-skip-browser-warning': '69420' },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (e) {}

  return NextResponse.json({ success: true, logs: [] });
}
