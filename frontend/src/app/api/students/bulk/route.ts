import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { encodeStudentEmail } from '@/lib/studentContact';
import { logAuditEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Authorized access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const action = body.action;

    // --- CASE 1: BULK DELETE / SAFE ARCHIVE ---
    if (action === 'delete') {
      const ids: string[] = body.ids || [];
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ success: false, error: 'No student IDs provided for deletion.' }, { status: 400 });
      }

      // Step 1: Query which students have historical attendance records
      const { data: attRecords } = await supabaseServer
        .from('attendance')
        .select('student_id')
        .in('student_id', ids);

      const studentIdsWithAttendance = new Set((attRecords || []).map((r: any) => r.student_id));
      const toArchiveIds = ids.filter(id => studentIdsWithAttendance.has(id));
      const toDeleteIds = ids.filter(id => !studentIdsWithAttendance.has(id));

      // Step 2: Soft-delete students with attendance: erase biometrics and credentials, archive student
      // Historical attendance records in 'attendance' table remain 100% UNTOUCHED!
      if (toArchiveIds.length > 0) {
        const { data: archiveRows } = await supabaseServer
          .from('students')
          .select('id, academic_year')
          .in('id', toArchiveIds);

        const archiveNow = new Date().toISOString();
        for (const row of archiveRows || []) {
          const origYear = row.academic_year || '1st Year';
          const archivedYear = origYear.startsWith('[ARCHIVED]') ? origYear : `[ARCHIVED] ${origYear}`;
          await supabaseServer
            .from('students')
            .update({
              is_active: false,
              archived_at: archiveNow,
              academic_year: archivedYear,
              face_encoding: null,
              biometric_consent: false,
              biometric_consent_date: null,
              portal_pin: null,
              portal_password_hash: null,
            })
            .eq('id', row.id);
        }
      }

      // Step 3: Hard-delete ONLY students with 0 attendance records
      if (toDeleteIds.length > 0) {
        const { error } = await supabaseServer.from('students').delete().in('id', toDeleteIds);
        if (error) throw error;
      }

      logAuditEvent({
        action: 'BULK_DELETE_STUDENTS',
        targetType: 'student',
        targetId: `count:${ids.length}`,
        actorId: session.username || session.name || 'admin',
        request,
        details: {
          total_requested: ids.length,
          archived_count: toArchiveIds.length,
          deleted_count: toDeleteIds.length,
          attendance_preserved: true,
          deleted_at: new Date().toISOString(),
          actor_name: session.name,
          actor_role: session.role,
        },
      });

      return NextResponse.json({
        success: true,
        archivedCount: toArchiveIds.length,
        deletedCount: toDeleteIds.length,
        message: `${toArchiveIds.length} students archived (attendance records preserved), ${toDeleteIds.length} empty students deleted.`,
      });
    }

    // --- CASE 2: BULK IMPORT ---
    if (action === 'import') {
      const rawStudents: any[] = body.students || [];
      const selectedYear: string = body.selectedYear || '1st Year';
      const useFileYear: boolean = Boolean(body.useFileYear);

      if (!Array.isArray(rawStudents) || rawStudents.length === 0) {
        return NextResponse.json({ success: false, error: 'No valid students provided for import.' }, { status: 400 });
      }

      // Fetch existing students by roll
      const { data: existingStudents, error: fetchErr } = await supabaseServer
        .from('students')
        .select('id, student_roll');

      if (fetchErr) throw fetchErr;

      const existingMap = new Map<string, any>();
      (existingStudents || []).forEach(s => {
        if (s.student_roll) existingMap.set(s.student_roll.toLowerCase().trim(), s);
      });

      const toInsert: any[] = [];
      const toUpdate: any[] = [];

      rawStudents.forEach((student: any) => {
        const cleanRoll = (student.student_roll || '').trim();
        if (!cleanRoll) return;

        const cleanKey = cleanRoll.toLowerCase();
        const generatedEmail = encodeStudentEmail(cleanRoll, student.parent_phone);
        const academicYear = useFileYear && student.academic_year ? student.academic_year : selectedYear;

        if (existingMap.has(cleanKey)) {
          const existing = existingMap.get(cleanKey);
          toUpdate.push({
            id: existing.id,
            student_roll: cleanRoll,
            full_name: (student.full_name || '').trim(),
            email: generatedEmail,
            academic_year: academicYear,
            parent_phone: student.parent_phone ? student.parent_phone.trim() : null,
          });
        } else {
          toInsert.push({
            student_roll: cleanRoll,
            full_name: (student.full_name || '').trim(),
            email: generatedEmail,
            academic_year: academicYear,
            parent_phone: student.parent_phone ? student.parent_phone.trim() : null,
            face_encoding: null,
          });
        }
      });

      // Insert new students in chunks of 50
      if (toInsert.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const chunk = toInsert.slice(i, i + chunkSize);
          const { error: insertErr } = await supabaseServer.from('students').insert(chunk);
          if (insertErr) {
            // If parent_phone column fails, fallback without parent_phone
            if (insertErr.code === 'PGRST204' || insertErr.message?.includes('parent_phone')) {
              const fallbackChunk = chunk.map(c => {
                const { parent_phone, ...rest } = c;
                return rest;
              });
              const { error: retryErr } = await supabaseServer.from('students').insert(fallbackChunk);
              if (retryErr) throw retryErr;
            } else {
              throw insertErr;
            }
          }
        }
      }

      // Update existing students
      if (toUpdate.length > 0) {
        for (const updateItem of toUpdate) {
          const updatePayload: any = {
            full_name: updateItem.full_name,
            email: updateItem.email,
            academic_year: updateItem.academic_year,
          };
          if (updateItem.parent_phone) updatePayload.parent_phone = updateItem.parent_phone;

          const { error: updateErr } = await supabaseServer
            .from('students')
            .update(updatePayload)
            .eq('id', updateItem.id);

          if (updateErr && (updateErr.code === 'PGRST204' || updateErr.message?.includes('parent_phone'))) {
            delete updatePayload.parent_phone;
            await supabaseServer.from('students').update(updatePayload).eq('id', updateItem.id);
          }
        }
      }

      logAuditEvent({
        action: 'BULK_IMPORT_STUDENTS',
        targetType: 'student',
        targetId: `inserted:${toInsert.length},updated:${toUpdate.length}`,
        actorId: session.username || session.name || 'admin',
        request,
        details: {
          inserted: toInsert.length,
          updated: toUpdate.length,
          total: rawStudents.length,
          actor_name: session.name,
          actor_role: session.role,
        },
      });

      return NextResponse.json({
        success: true,
        insertedCount: toInsert.length,
        updatedCount: toUpdate.length,
        totalCount: rawStudents.length,
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown bulk action.' }, { status: 400 });
  } catch (err: any) {
    console.error('Error in /api/students/bulk:', err);
    return NextResponse.json({ success: false, error: err.message || 'Bulk operation failed.' }, { status: 500 });
  }
}
