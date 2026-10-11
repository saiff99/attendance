import { NextResponse, NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { logAuditEvent } from '@/lib/auditLog';

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
    if (!id || id.startsWith('builtin-')) {
      return NextResponse.json(
        { success: false, error: 'Cannot modify built-in system administrator accounts via database.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updatePayload: any = {};

    if (body.full_name !== undefined) updatePayload.full_name = body.full_name.trim();
    if (body.department !== undefined) updatePayload.department = body.department.trim();
    if (body.email !== undefined) updatePayload.email = body.email ? body.email.trim().toLowerCase() : null;
    if (body.role !== undefined) {
      updatePayload.role = body.role === 'Super Admin' ? 'Super Admin' : 'Faculty';
    }
    if (body.is_active !== undefined) {
      updatePayload.is_active = Boolean(body.is_active);
    }

    // Password reset support
    if (body.password && typeof body.password === 'string' && body.password.trim().length >= 6) {
      updatePayload.password_hash = await bcrypt.hash(body.password.trim(), 10);
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ success: false, error: 'No fields provided to update.' }, { status: 400 });
    }

    const { data: updatedUser, error } = await supabaseServer
      .from('app_users')
      .update(updatePayload)
      .eq('id', id)
      .select('id, username, full_name, email, role, department, is_active')
      .single();

    if (error) throw error;

    logAuditEvent({
      action: updatePayload.password_hash ? 'RESET_USER_PASSWORD' : 'UPDATE_USER_PROFILE',
      targetType: 'system',
      targetId: id,
      actorId: session.username,
      details: {
        updatedFields: Object.keys(updatePayload).filter(k => k !== 'password_hash'),
        hasPasswordReset: Boolean(updatePayload.password_hash),
      },
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'User updated successfully.',
    });
  } catch (error: any) {
    console.error('[PATCH /api/users/[id] ERROR]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update user.' },
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
    if (!id || id.startsWith('builtin-')) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete built-in system administrator accounts.' },
        { status: 400 }
      );
    }

    // Fetch user to verify they are not deleting themselves
    const { data: targetUser } = await supabaseServer
      .from('app_users')
      .select('id, username, full_name')
      .eq('id', id)
      .single();

    if (targetUser && targetUser.username.toLowerCase() === session.username.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'You cannot delete your own active administrator account.' },
        { status: 400 }
      );
    }

    const { error } = await supabaseServer
      .from('app_users')
      .delete()
      .eq('id', id);

    if (error) throw error;

    logAuditEvent({
      action: 'DELETE_USER',
      targetType: 'system',
      targetId: id,
      actorId: session.username,
      details: { deleted_username: targetUser?.username },
    });

    return NextResponse.json({
      success: true,
      message: `User ${targetUser?.full_name || id} deleted successfully.`,
    });
  } catch (error: any) {
    console.error('[DELETE /api/users/[id] ERROR]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete user.' },
      { status: 500 }
    );
  }
}
