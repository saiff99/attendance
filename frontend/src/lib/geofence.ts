export interface CampusGeofenceConfig {
  enabled: boolean;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  campusName: string;
}

// Default permanent classroom location for JIMSH (covers 1st, 2nd, 3rd & all floors)
export const DEFAULT_GEOFENCE_CONFIG: CampusGeofenceConfig = {
  enabled: true,
  latitude: 22.451550, // Classroom Center Latitude
  longitude: 88.172366, // Classroom Center Longitude
  radiusMeters: 250, // 250m covers all floors, wings and lecture halls of this building
  campusName: "JIMSH Medical College Campus & Lecture Halls",
};

/**
 * Calculates accurate geodesic distance between two GPS coordinates using the Haversine formula.
 * @returns distance in meters
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
    Math.cos(phi2) *
    Math.sin(deltaLambda / 2) *
    Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Formats distance in a human-friendly format (meters or kilometers)
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Gets the user's high-precision GPS coordinate from browser Geolocation API
 */
export function getUserCoordinates(
  timeoutMs: number = 10000
): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        let msg = "Could not access location.";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg = "Location permission was denied. Please allow location access in your browser settings to verify attendance.";
            break;
          case error.POSITION_UNAVAILABLE:
            msg = "Location information is unavailable. Please check your device GPS.";
            break;
          case error.TIMEOUT:
            msg = "Location request timed out. Please try again.";
            break;
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Encodes GPS Geofence config inside session topic/instructor string for seamless cloud sync
 */
export function encodeSessionMetadata(topic: string, geofence?: CampusGeofenceConfig | null): string {
  if (!geofence) return topic;
  const tag = `[GPS:${geofence.latitude.toFixed(6)},${geofence.longitude.toFixed(6)},${geofence.radiusMeters},${geofence.enabled ? 1 : 0},${encodeURIComponent(geofence.campusName || "Campus")}]`;
  return `${topic.trim()} ${tag}`.trim();
}

/**
 * Decodes GPS Geofence config from session topic/instructor string
 */
export function decodeSessionMetadata(rawTopicOrInstructor: string): { topic: string; geofence: CampusGeofenceConfig | null } {
  if (!rawTopicOrInstructor) return { topic: "", geofence: null };
  const match = rawTopicOrInstructor.match(/\[GPS:([-\d.]+),([-\d.]+),(\d+),([01])(?:,([^\]]*))?\]/);
  if (!match) {
    return { topic: rawTopicOrInstructor.trim(), geofence: null };
  }
  const cleanTopic = rawTopicOrInstructor.replace(match[0], "").trim();
  let campusName = "College Campus / Lecture Hall";
  if (match[5]) {
    try {
      campusName = decodeURIComponent(match[5]);
    } catch (e) {
      campusName = match[5];
    }
  }
  return {
    topic: cleanTopic || "General Lecture",
    geofence: {
      latitude: parseFloat(match[1]),
      longitude: parseFloat(match[2]),
      radiusMeters: parseInt(match[3], 10),
      enabled: match[4] === "1",
      campusName,
    },
  };
}

/**
 * Save geofence to localStorage
 */
export function saveLocalGeofence(config: CampusGeofenceConfig): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("campus_geofence_config", JSON.stringify(config));
    } catch (e) { }
  }
}

/**
 * Read geofence from localStorage with fallback
 */
export function getLocalGeofence(): CampusGeofenceConfig {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("campus_geofence_config");
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) { }
  }
  return DEFAULT_GEOFENCE_CONFIG;
}

