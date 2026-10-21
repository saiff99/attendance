import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';
import { requireRoles } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const auth = await requireRoles(req, ['Super Admin', 'Admin', 'Faculty']);
    if (auth.errorResponse) {
      return NextResponse.json(auth.errorResponse.body, { status: auth.errorResponse.status });
    }

    const { jobId } = await params;
    const res = await fetchBackend(`/api/whatsapp/job-status/${encodeURIComponent(jobId)}`, {
      method: 'GET',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch job status' },
      { status: 500 }
    );
  }
}
