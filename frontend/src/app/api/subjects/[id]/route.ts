import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || session.role !== 'Super Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Super Admin access required.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const updatePayload: Record<string, any> = {};
    if (typeof body.name === 'string') updatePayload.name = body.name.trim();
    if (typeof body.code === 'string') updatePayload.code = body.code.trim();
    if (typeof body.academic_year === 'string') updatePayload.academic_year = body.academic_year.trim();
    if (typeof body.department === 'string') updatePayload.department = body.department.trim();
    if (typeof body.is_active === 'boolean') updatePayload.is_active = body.is_active;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ success: false, error: 'No update data provided.' }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from('academic_subjects')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    logAuditEvent({
      action: 'UPDATE_SUBJECT',
      targetType: 'system',
      targetId: id,
      details: updatePayload,
    });

    return NextResponse.json({
      success: true,
      subject: data,
    });
  } catch (err: any) {
    console.error('Error updating subject:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update subject.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || session.role !== 'Super Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Super Admin access required.' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const { error } = await supabaseServer
      .from('academic_subjects')
      .delete()
      .eq('id', id);

    if (error) throw error;

    logAuditEvent({
      action: 'DELETE_SUBJECT',
      targetType: 'system',
      targetId: id,
    });

    return NextResponse.json({
      success: true,
      message: 'Subject deleted successfully.',
    });
  } catch (err: any) {
    console.error('Error deleting subject:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to delete subject.' },
      { status: 500 }
    );
  }
}
