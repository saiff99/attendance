import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { DEFAULT_GEOFENCE_CONFIG, CampusGeofenceConfig } from '@/lib/geofence';

export const dynamic = 'force-dynamic';

// In-memory cache for fast geofence responses
let cachedGeofence: CampusGeofenceConfig = { ...DEFAULT_GEOFENCE_CONFIG };

export async function GET() {
  try {
    // Try reading from Supabase settings if table exists
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'campus_geofence')
        .single();

      if (!error && data?.value) {
        cachedGeofence = { ...DEFAULT_GEOFENCE_CONFIG, ...data.value };
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
    const body = await request.json();
    const updatedConfig: CampusGeofenceConfig = {
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : cachedGeofence.enabled,
      latitude: Number(body.latitude) || cachedGeofence.latitude,
      longitude: Number(body.longitude) || cachedGeofence.longitude,
      radiusMeters: Math.max(20, Math.min(2000, Number(body.radiusMeters) || cachedGeofence.radiusMeters)),
      campusName: String(body.campusName || cachedGeofence.campusName).trim(),
    };

    cachedGeofence = updatedConfig;

    // Persist to Supabase if possible
    try {
      await supabase
        .from('settings')
        .upsert({ key: 'campus_geofence', value: updatedConfig }, { onConflict: 'key' });
    } catch (e) {}

    return NextResponse.json({ success: true, config: cachedGeofence });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
