import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const rawFormData = await request.formData();
    
    const file = rawFormData.get('file') as Blob | null;
    const sessionId = (rawFormData.get('session_id') as string) || '';
    const studentRoll = (rawFormData.get('student_roll') as string) || '';
    const latitude = rawFormData.get('latitude') as string | null;
    const longitude = rawFormData.get('longitude') as string | null;
    const distanceMeters = rawFormData.get('distance_meters') as string | null;
    const deviceId = (rawFormData.get('device_id') as string) || '';

    if (!file || !sessionId || !studentRoll) {
      return NextResponse.json({ detail: "Missing required attendance parameters." }, { status: 400 });
    }

    // Security: Validate file size (Max 6MB) and MIME type
    if (file.size > 6 * 1024 * 1024) {
      return NextResponse.json({ detail: "Selfie image too large (Max 6MB)." }, { status: 413 });
    }
    if (file.type && !file.type.startsWith('image/')) {
      return NextResponse.json({ detail: "Invalid file format. Only images are permitted." }, { status: 415 });
    }

    const fileBuffer = await file.arrayBuffer();

    const createFormData = () => {
      const fd = new FormData();
      const newBlob = new Blob([fileBuffer], { type: file.type || 'image/jpeg' });
      fd.append('file', newBlob, 'selfie.jpg');
      fd.append('session_id', sessionId);
      fd.append('student_roll', studentRoll);
      if (latitude) fd.append('latitude', latitude);
      if (longitude) fd.append('longitude', longitude);
      if (distanceMeters) fd.append('distance_meters', distanceMeters);
      if (deviceId) fd.append('device_id', deviceId);
      return fd;
    };

    let res = await fetchBackend('/api/selfie-attendance', {
      method: 'POST',
      body: createFormData(),
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

    // Auto-retry once on transient 500/502/503/504 errors or idle socket drops
    const detailLower = typeof data?.detail === 'string' ? data.detail.toLowerCase() : '';
    const isTransientDisconnect =
      res.status >= 500 && (
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504 ||
        detailLower.includes('server disconnected') ||
        detailLower.includes('remoteprotocolerror') ||
        detailLower.includes('connection reset') ||
        detailLower.includes('connection closed') ||
        detailLower.includes('broken pipe')
      );

    if (isTransientDisconnect) {
      console.warn(`[Proxy Auto-Retry] Transient error (${res.status} - ${data?.detail}). Re-submitting attendance with fresh connection after 300ms...`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      res = await fetchBackend('/api/selfie-attendance', {
        method: 'POST',
        body: createFormData(),
      });
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => '');
        data = { detail: text || `Server returned status ${res.status}` };
      }
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


