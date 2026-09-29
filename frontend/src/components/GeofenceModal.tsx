"use client";

import { useState, useEffect } from "react";
import { X, MapPin, ShieldCheck, ShieldAlert, Navigation, Loader2, Check, RefreshCw } from "lucide-react";
import { 
  CampusGeofenceConfig, 
  DEFAULT_GEOFENCE_CONFIG, 
  calculateDistanceMeters, 
  formatDistance, 
  getUserCoordinates,
  getLocalGeofence,
  saveLocalGeofence
} from "@/lib/geofence";


interface GeofenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: (config: CampusGeofenceConfig) => void;
}

export function GeofenceModal({ isOpen, onClose, onConfigSaved }: GeofenceModalProps) {
  const [config, setConfig] = useState<CampusGeofenceConfig>(() => getLocalGeofence());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capturingGPS, setCapturingGPS] = useState(false);
  const [currentGPS, setCurrentGPS] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSavedSuccess(false);
      setGpsError(null);
      const local = getLocalGeofence();
      setConfig(local);
      fetchConfig();
    }
  }, [isOpen]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/geofence");
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig(data.config);
          saveLocalGeofence(data.config);
        }
      }
    } catch (e) {
      console.error("Failed to fetch geofence config", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCaptureCurrentLocation = async () => {
    setCapturingGPS(true);
    setGpsError(null);
    try {
      const coords = await getUserCoordinates(12000);
      setCurrentGPS({ latitude: coords.latitude, longitude: coords.longitude });
      const updated = {
        ...config,
        latitude: parseFloat(coords.latitude.toFixed(6)),
        longitude: parseFloat(coords.longitude.toFixed(6)),
      };
      setConfig(updated);
      saveLocalGeofence(updated);
    } catch (err: any) {
      setGpsError(err.message || "Failed to capture current location");
    } finally {
      setCapturingGPS(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setGpsError(null);
    try {
      saveLocalGeofence(config);
      if (onConfigSaved) {
        onConfigSaved(config);
      }

      await fetch("/api/geofence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      }).catch(() => null);

      setSavedSuccess(true);
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      setGpsError(err.message || "Failed to save geofence configuration");
    } finally {
      setSaving(false);
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col transition-colors duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800/80 bg-gray-50/80 dark:bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl ${config.enabled ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}`}>
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                GPS Geofence Shield
                {config.enabled ? (
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">Active</span>
                ) : (
                  <span className="text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-semibold">Disabled</span>
                )}
              </h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Restricts mobile selfie attendance to physical classroom / campus bounds
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs text-gray-700 dark:text-slate-300">
          
          {/* Geofence Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 dark:bg-slate-950/60 border border-gray-200 dark:border-slate-800">
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">Enforce GPS Location Verification</p>
              <p className="text-gray-500 dark:text-slate-400 text-[11px] mt-0.5">
                Rejects attendance submissions from outside the allowed radius (e.g. hostel/home)
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Campus Name */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400 text-[10px] mb-1.5">
              Campus / Building Name
            </label>
            <input
              type="text"
              value={config.campusName}
              onChange={(e) => setConfig({ ...config, campusName: e.target.value })}
              className="w-full rounded-xl border border-gray-200 dark:border-slate-800 py-2.5 px-3 text-gray-900 dark:text-white bg-white dark:bg-slate-950/80 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs font-medium"
              placeholder="e.g. Medical College Campus / Lecture Complex"
            />
          </div>

          {/* Coordinates Inputs & Capture Button */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400 text-[10px]">
                Target Classroom / Campus GPS Coordinates
              </label>
              <button
                type="button"
                onClick={handleCaptureCurrentLocation}
                disabled={capturingGPS}
                className="inline-flex items-center text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-50 transition-colors"
              >
                {capturingGPS ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Capturing GPS...</>
                ) : (
                  <><Navigation className="w-3.5 h-3.5 mr-1" /> Use Current Device GPS</>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 dark:text-slate-400 mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={config.latitude}
                  onChange={(e) => setConfig({ ...config, latitude: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-800 py-2 px-3 text-gray-900 dark:text-white bg-white dark:bg-slate-950/80 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 dark:text-slate-400 mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={config.longitude}
                  onChange={(e) => setConfig({ ...config, longitude: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-800 py-2 px-3 text-gray-900 dark:text-white bg-white dark:bg-slate-950/80 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Radius Slider */}
          <div className="space-y-2 p-3.5 rounded-xl bg-gray-50 dark:bg-slate-950/50 border border-gray-200 dark:border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900 dark:text-white text-xs">Allowed Boundary Radius:</span>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20">
                {config.radiusMeters} meters
              </span>
            </div>
            
            <input
              type="range"
              min="30"
              max="1000"
              step="10"
              value={config.radiusMeters}
              onChange={(e) => setConfig({ ...config, radiusMeters: Number(e.target.value) })}
              className="w-full h-2 bg-gray-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
            />

            <div className="flex justify-between text-[10px] text-gray-500 dark:text-slate-500 font-mono">
              <span>30m (Single Room)</span>
              <span>150m (Building)</span>
              <span>500m (Full Campus)</span>
            </div>
          </div>

          {/* GPS Error Message */}
          {gpsError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{gpsError}</span>
            </div>
          )}

          {/* Success Message */}
          {savedSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>Geofence settings updated and live!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-gray-100 dark:border-slate-800/80 bg-gray-50/80 dark:bg-slate-950/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            {saving ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
            ) : (
              <><ShieldCheck className="w-3.5 h-3.5" /> Save Geofence</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
