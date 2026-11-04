import { useState, useMemo, useCallback } from "react";
import {
  CampusGeofenceConfig,
  getLocalGeofence,
  saveLocalGeofence,
  decodeSessionMetadata,
  encodeSessionMetadata,
} from "@/lib/geofence";
import type { Session } from "@/types/database";

export function useGeofenceSync(
  activeSession: Session | null,
  onSessionUpdated?: (session: Session) => void
) {
  const [sessionGeofence, setSessionGeofence] = useState<CampusGeofenceConfig>(getLocalGeofence);

  // Compute currently active geofence config (from live session metadata or local default)
  const activeGeofenceConfig = useMemo<CampusGeofenceConfig>(() => {
    if (activeSession?.instructor_name) {
      const decoded = decodeSessionMetadata(activeSession.instructor_name);
      if (decoded.geofence) return decoded.geofence;
    }
    return sessionGeofence;
  }, [activeSession, sessionGeofence]);

  // Synchronize geofence changes immediately to active session in Supabase & local state
  const handleGeofenceSaved = useCallback(
    async (newConfig: CampusGeofenceConfig) => {
      setSessionGeofence(newConfig);
      saveLocalGeofence(newConfig);

      if (activeSession) {
        try {
          const meta = decodeSessionMetadata(activeSession.instructor_name);
          const updatedInstructor = encodeSessionMetadata(meta.topic, newConfig, meta.facultyUsername);

          const res = await fetch(`/api/sessions/${activeSession.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instructor_name: updatedInstructor }),
          });

          if (res.ok) {
            const json = await res.json();
            const savedInstructor = json?.session?.instructor_name || updatedInstructor;
            if (onSessionUpdated) {
              onSessionUpdated({ ...activeSession, instructor_name: savedInstructor });
            }
          } else {
            console.error("Failed to update active session geofence:", await res.text());
          }
        } catch (err: unknown) {
          console.error("Error saving session geofence:", err);
        }
      }
    },
    [activeSession, onSessionUpdated]
  );

  return {
    sessionGeofence,
    setSessionGeofence,
    activeGeofenceConfig,
    handleGeofenceSaved,
  };
}

