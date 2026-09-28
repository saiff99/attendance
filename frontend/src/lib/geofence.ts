export interface CampusGeofenceConfig {
  enabled: boolean;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  campusName: string;
}

// Default fallback location (can be customized by admin in the app)
export const DEFAULT_GEOFENCE_CONFIG: CampusGeofenceConfig = {
  enabled: true,
  latitude: 22.5726, // Default campus coordinate
  longitude: 88.3639,
  radiusMeters: 200, // 200 meters allowed radius
  campusName: "College Campus / Lecture Hall",
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
