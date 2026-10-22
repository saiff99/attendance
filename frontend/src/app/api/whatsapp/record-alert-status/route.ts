import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireRoles } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';
import { encodeSessionWhatsAppTag } from '@/lib/geofence';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRoles(req, ['Super Admin', 'Admin']);
    if (auth.errorResponse) {
      return NextResponse.json(auth.errorResponse.body, { status: auth.errorResponse.status });
    }

    const body = await req.json();
    const { sessionId, sentCount, completedAt, sessionName } = body;

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'Session ID is required.' }, { status: 400 });
    }

    // 1. Fetch current session to get instructor_name
    const { data: sessionData, error: sessError } = await supabaseServer
      .from('sessions')
      .select('id, class_name, instructor_name')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessError || !sessionData) {
      return NextResponse.json(
        { success: false, error: sessError?.message || 'Session not found.' },
        { status: 404 }
      );
    }

    const currentInstructor = sessionData.instructor_name || '';
    const safeCount = Number.isInteger(sentCount) ? sentCount : 0;
    const timestamp = completedAt || new Date().toISOString();

    // 2. Tag session with [WA:count:timestamp]
    const updatedInstructor = encodeSessionWhatsAppTag(currentInstructor, safeCount, timestamp);

    const { error: updateError } = await supabaseServer
      .from('sessions')
      .update({ instructor_name: updatedInstructor })
      .eq('id', sessionId);

    if (updateError) {
      throw updateError;
    }

    // 3. Log to audit_logs
    await logAuditEvent({
      action: 'WHATSAPP_ABSENTEE_ALERTS',
      targetType: 'session',
      targetId: sessionId,
      details: {
        sent_count: safeCount,
        completed_at: timestamp,
        class_name: sessionData.class_name || sessionName || 'Class Session',
      },
      request: req,
    });

    return NextResponse.json({
      success: true,
      sessionId,
      sentCount: safeCount,
      completedAt: timestamp,
    });
  } catch (error: any) {
    console.error('Failed to record WhatsApp alert status:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
