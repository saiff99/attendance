import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { DEFAULT_GEOFENCE_CONFIG, CampusGeofenceConfig } from '@/lib/geofence';
import { requireRoles } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// In-memory cache for fast geofence responses with 5-minute TTL
export const GEOFENCE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedGeofence: CampusGeofenceConfig = { ...DEFAULT_GEOFENCE_CONFIG };
let cacheLastFetched = 0;

export function invalidateGeofenceCache(): void {
  cacheLastFetched = 0;
}

export function getCachedGeofence(): CampusGeofenceConfig {
  return { ...cachedGeofence };
}

export function validateGeofenceInput(
  body: unknown,
  current: CampusGeofenceConfig
): { valid: true; config: CampusGeofenceConfig } | { valid: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a valid JSON object.' };
  }

  const b = body as Record<string, unknown>;

  // 1. Latitude validation: must be finite number in [-90, 90]
  let latitude = current.latitude;
  if ('latitude' in b) {
    if (b.latitude === null || b.latitude === '') {
      return { valid: false, error: 'Latitude cannot be empty.' };
    }
    const latNum = typeof b.latitude === 'number' ? b.latitude : Number(b.latitude);
    if (!Number.isFinite(latNum) || Number.isNaN(latNum)) {
      return { valid: false, error: 'Latitude must be a valid finite number.' };
    }
    if (latNum < -90 || latNum > 90) {
      return { valid: false, error: 'Latitude must be between -90 and 90 degrees.' };
    }
    latitude = latNum;
  }

  // 2. Longitude validation: must be finite number in [-180, 180]
  let longitude = current.longitude;
  if ('longitude' in b) {
    if (b.longitude === null || b.longitude === '') {
      return { valid: false, error: 'Longitude cannot be empty.' };
    }
    const lngNum = typeof b.longitude === 'number' ? b.longitude : Number(b.longitude);
    if (!Number.isFinite(lngNum) || Number.isNaN(lngNum)) {
      return { valid: false, error: 'Longitude must be a valid finite number.' };
    }
    if (lngNum < -180 || lngNum > 180) {
      return { valid: false, error: 'Longitude must be between -180 and 180 degrees.' };
    }
    longitude = lngNum;
  }

  // 3. Radius validation: positive number within allowable bounds (10m to 5000m)
  let radiusMeters = current.radiusMeters;
  if ('radiusMeters' in b) {
    if (b.radiusMeters === null || b.radiusMeters === '') {
      return { valid: false, error: 'Radius cannot be empty.' };
    }
    const radNum = typeof b.radiusMeters === 'number' ? b.radiusMeters : Number(b.radiusMeters);
    if (!Number.isFinite(radNum) || Number.isNaN(radNum)) {
      return { valid: false, error: 'Radius must be a valid positive number.' };
    }
    if (radNum <= 0) {
      return { valid: false, error: 'Radius must be a positive number greater than 0.' };
    }
    if (radNum < 10 || radNum > 5000) {
      return { valid: false, error: 'Radius must be between 10 and 5000 meters.' };
    }
    radiusMeters = Math.round(radNum);
  }

  // 4. Enabled flag validation
  let enabled = current.enabled;
  if ('enabled' in b) {
    if (typeof b.enabled !== 'boolean') {
      if (b.enabled === 'true' || b.enabled === 1) enabled = true;
      else if (b.enabled === 'false' || b.enabled === 0) enabled = false;
      else {
        return { valid: false, error: 'Enabled field must be a valid boolean.' };
      }
    } else {
      enabled = b.enabled;
    }
  }

  // 5. Campus Name validation
  let campusName = current.campusName;
  if ('campusName' in b) {
    if (typeof b.campusName !== 'string') {
      return { valid: false, error: 'Campus name must be a string.' };
    }
    const trimmed = b.campusName.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: 'Campus name cannot be empty.' };
    }
    if (trimmed.length > 150) {
      return { valid: false, error: 'Campus name must be 150 characters or less.' };
    }
    campusName = trimmed;
  }

  return {
    valid: true,
    config: {
      enabled,
      latitude,
      longitude,
      radiusMeters,
      campusName,
    },
  };
}

export async function GET(request?: Request) {
  try {
    const now = Date.now();

    // Check optional cache-busting query parameter (?force=true or fresh=1)
    let forceRefresh = false;
    if (request) {
      try {
        const url = new URL(request.url);
        forceRefresh = url.searchParams.get('force') === 'true' || url.searchParams.get('fresh') === '1';
      } catch {
        // Fallback for mock or custom requests without full url
      }
    }

    // 1. Fast-Path: Serve from in-memory cache if within 5-minute TTL window
    if (!forceRefresh && cacheLastFetched > 0 && (now - cacheLastFetched) < GEOFENCE_CACHE_TTL_MS) {
      return NextResponse.json({ success: true, config: cachedGeofence, cached: true });
    }

    // 2. Try reading from Supabase settings if table exists
    try {
      const { data, error } = await supabaseServer
        .from('settings')
        .select('value')
        .eq('key', 'campus_geofence')
        .single();

      if (!error && data?.value && typeof data.value === 'object') {
        const v = data.value;
        if (
          typeof v.latitude === 'number' && Number.isFinite(v.latitude) &&
          typeof v.longitude === 'number' && Number.isFinite(v.longitude) &&
          typeof v.radiusMeters === 'number' && Number.isFinite(v.radiusMeters)
        ) {
          cachedGeofence = {
            enabled: Boolean(v.enabled),
            latitude: v.latitude,
            longitude: v.longitude,
            radiusMeters: v.radiusMeters,
            campusName: String(v.campusName || DEFAULT_GEOFENCE_CONFIG.campusName),
          };
          cacheLastFetched = Date.now();
          return NextResponse.json({ success: true, config: cachedGeofence });
        }
      }
    } catch {
      // Continue to fallback
    }

    // 3. Fallback to sessions table system row (00000000-0000-0000-0000-000000000001)
    try {
      const { data: sessData, error: sessErr } = await supabaseServer
        .from('sessions')
        .select('instructor_name')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single();

      if (!sessErr && sessData?.instructor_name) {
        try {
          const parsed = JSON.parse(sessData.instructor_name);
          if (
            typeof parsed.latitude === 'number' && Number.isFinite(parsed.latitude) &&
            typeof parsed.longitude === 'number' && Number.isFinite(parsed.longitude) &&
            typeof parsed.radiusMeters === 'number' && Number.isFinite(parsed.radiusMeters)
          ) {
            cachedGeofence = {
              enabled: Boolean(parsed.enabled),
              latitude: parsed.latitude,
              longitude: parsed.longitude,
              radiusMeters: parsed.radiusMeters,
              campusName: String(parsed.campusName || DEFAULT_GEOFENCE_CONFIG.campusName),
            };
            cacheLastFetched = Date.now();
            return NextResponse.json({ success: true, config: cachedGeofence });
          }
        } catch {
          // JSON parsing failed, proceed to cached/default
        }
      }
    } catch {
      // Continue
    }

    // Mark cache fresh even with default fallback to protect database under outages
    cacheLastFetched = Date.now();
    return NextResponse.json({ success: true, config: cachedGeofence });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve geofence configuration';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRoles(request, ['Super Admin']);
    if (auth.errorResponse) {
      return NextResponse.json(auth.errorResponse.body, { status: auth.errorResponse.status });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }

    // Strict input validation
    const validation = validateGeofenceInput(body, cachedGeofence);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const targetConfig = validation.config;

    // Test hook for database failure simulation (Super Admin authenticated)
    const simulateDbFail = request.headers.get('x-test-simulate-db-failure') === '1';

    let persisted = false;
    let lastErrorMessage: string | null = null;

    if (!simulateDbFail) {
      // 1. Try settings table
      try {
        const { error: settingsError } = await supabaseServer
          .from('settings')
          .upsert({ key: 'campus_geofence', value: targetConfig }, { onConflict: 'key' });

        if (!settingsError) {
          persisted = true;
        } else {
          lastErrorMessage = settingsError.message;
          console.warn('Supabase settings upsert error for geofence:', settingsError.message);
        }
      } catch (e: unknown) {
        lastErrorMessage = e instanceof Error ? e.message : String(e);
        console.warn('Exception during settings upsert for geofence:', lastErrorMessage);
      }

      // 2. Also persist to sessions table backup config row for guaranteed durability
      try {
        const { error: sessionsError } = await supabaseServer
          .from('sessions')
          .upsert({
            id: '00000000-0000-0000-0000-000000000001',
            class_name: '__GEOFENCE_CONFIG__',
            instructor_name: JSON.stringify(targetConfig),
            date: '2000-01-01',
            start_time: '2000-01-01T00:00:00Z',
            end_time: '2000-01-01T00:00:00Z',
            target_academic_year: 'System'
          });

        if (!sessionsError) {
          persisted = true;
        } else {
          if (!persisted) {
            lastErrorMessage = sessionsError.message;
          }
          console.warn('Supabase sessions backup row upsert error for geofence:', sessionsError.message);
        }
      } catch (e: unknown) {
        if (!persisted) {
          lastErrorMessage = e instanceof Error ? e.message : String(e);
        }
        console.warn('Exception during sessions backup row upsert for geofence:', lastErrorMessage);
      }
    } else {
      lastErrorMessage = 'Simulated database network timeout/failure.';
    }

    // Fail-closed persistence: If persistent save was not confirmed, do NOT change in-memory cache and do NOT report success
    if (!persisted) {
      return NextResponse.json(
        {
          success: false,
          error: `Database persistence failed: ${lastErrorMessage || 'Failed to persist geofence configuration to persistent storage.'}`,
        },
        { status: 500 }
      );
    }

    // Update in-memory cache only AFTER persistent state is guaranteed
    cachedGeofence = targetConfig;
    cacheLastFetched = Date.now();

    return NextResponse.json({ success: true, config: cachedGeofence });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
