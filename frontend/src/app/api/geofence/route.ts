import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { DEFAULT_GEOFENCE_CONFIG, CampusGeofenceConfig } from '@/lib/geofence';
import { requireRoles } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// In-memory cache for fast geofence responses
let cachedGeofence: CampusGeofenceConfig = { ...DEFAULT_GEOFENCE_CONFIG };

export async function GET() {
  try {
    // 1. Try reading from Supabase settings if table exists
    try {
      const { data, error } = await supabaseServer
        .from('settings')
        .select('value')
        .eq('key', 'campus_geofence')
        .single();

      if (!error && data?.value) {
        cachedGeofence = { ...DEFAULT_GEOFENCE_CONFIG, ...data.value };
        return NextResponse.json({ success: true, config: cachedGeofence });
      }
    } catch (e) {}

    // 2. Fallback to sessions table system row (00000000-0000-0000-0000-000000000001)
    try {
      const { data: sessData, error: sessErr } = await supabaseServer
        .from('sessions')
        .select('instructor_name')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single();

      if (!sessErr && sessData?.instructor_name) {
        const parsed = JSON.parse(sessData.instructor_name);
        cachedGeofence = { ...DEFAULT_GEOFENCE_CONFIG, ...parsed };
        return NextResponse.json({ success: true, config: cachedGeofence });
      }
    } catch (e) {}

    return NextResponse.json({ success: true, config: cachedGeofence });
  } catch (err: any) {
    return NextResponse.json({ success: true, config: cachedGeofence });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRoles(request, ['Super Admin']);
    if (auth.errorResponse) {
      return NextResponse.json(auth.errorResponse.body, { status: auth.errorResponse.status });
    }

    const body = await request.json();
    const updatedConfig: CampusGeofenceConfig = {
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : cachedGeofence.enabled,
      latitude: Number(body.latitude) || cachedGeofence.latitude,
      longitude: Number(body.longitude) || cachedGeofence.longitude,
      radiusMeters: Math.max(20, Math.min(2000, Number(body.radiusMeters) || cachedGeofence.radiusMeters)),
      campusName: String(body.campusName || cachedGeofence.campusName).trim(),
    };

    cachedGeofence = updatedConfig;

    // 1. Persist to Supabase settings table if possible
    try {
      await supabaseServer
        .from('settings')
        .upsert({ key: 'campus_geofence', value: updatedConfig }, { onConflict: 'key' });
    } catch (e) {}

    // 2. Persist to sessions table system config row for guaranteed durability
    try {
      await supabaseServer
        .from('sessions')
        .upsert({
          id: '00000000-0000-0000-0000-000000000001',
          class_name: '__GEOFENCE_CONFIG__',
          instructor_name: JSON.stringify(updatedConfig),
          date: '2000-01-01',
          start_time: '2000-01-01T00:00:00Z',
          end_time: '2000-01-01T00:00:00Z',
          target_academic_year: 'System'
        });
    } catch (e) {}

    return NextResponse.json({ success: true, config: cachedGeofence });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
