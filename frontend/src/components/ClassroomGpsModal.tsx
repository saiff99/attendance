"use client";

import { useState, useEffect } from "react";
import {
  Check,
  MapPin,
  Navigation,
  Loader2,
  Copy,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  X,
  Compass,
} from "lucide-react";

export interface ClassroomGpsModalProps {
  isOpen: boolean;
  status: "calibrating" | "success" | "error";
  progressText?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  campusName?: string;
  radiusMeters?: number;
  errorMessage?: string;
  onClose: () => void;
  onRetry?: () => void;
}

export function ClassroomGpsModal({
  isOpen,
  status,
  progressText,
  latitude,
  longitude,
  accuracy,
  campusName,
  radiusMeters = 30,
  errorMessage,
  onClose,
  onRetry,
}: ClassroomGpsModalProps) {
  const [copied, setCopied] = useState(false);

  // Close on Escape key press (unless actively calibrating)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "calibrating") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, status, onClose]);

  if (!isOpen) return null;

  const handleCopyCoords = () => {
    if (latitude && longitude) {
      navigator.clipboard.writeText(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const googleMapsUrl =
    latitude && longitude
      ? `https://www.google.com/maps?q=${latitude},${longitude}`
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        // Close if clicked on outer backdrop and not actively calibrating
        if (e.target === e.currentTarget && status !== "calibrating") {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-md bg-white dark:bg-[#0B111E] border border-gray-200 dark:border-slate-800 rounded-3xl shadow-2xl p-5 sm:p-7 overflow-hidden transition-all duration-300 animate-in zoom-in-95">
        {/* Subtle decorative background glow */}
        <div
          className={`absolute -top-24 -left-24 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-40 transition-colors ${
            status === "success"
              ? "bg-emerald-500"
              : status === "error"
              ? "bg-rose-500"
              : "bg-indigo-500"
          }`}
        />
        <div
          className={`absolute -bottom-24 -right-24 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-30 transition-colors ${
            status === "success"
              ? "bg-teal-500"
              : status === "error"
              ? "bg-amber-500"
              : "bg-violet-500"
          }`}
        />

        {/* Top Close Button (Available in Success & Error states) */}
        {status !== "calibrating" && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* ========================================================= */}
        {/* STATE 1: CALIBRATING (Satellite Lock In-Progress)          */}
        {/* ========================================================= */}
        {status === "calibrating" && (
          <div className="relative flex flex-col items-center text-center py-2">
            {/* Animated Radar Pulse */}
            <div className="relative w-20 h-20 mb-5 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-indigo-500/20 dark:bg-indigo-500/30 animate-ping opacity-75" />
              <div className="absolute inset-2 rounded-full bg-indigo-500/20 dark:bg-indigo-500/25 border border-indigo-500/40 animate-pulse" />
              <div className="relative z-10 w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-600/30 text-white">
                <Navigation className="w-5 h-5 animate-spin [animation-duration:3s]" />
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1.5 flex items-center gap-2">
              <span>Calibrating Classroom GPS</span>
              <Compass className="w-4 h-4 text-indigo-500 animate-spin [animation-duration:8s]" />
            </h3>

            <p className="text-xs text-gray-600 dark:text-slate-400 max-w-xs mb-4">
              Sampling multi-satellite coordinates to eliminate indoor multipath drift and jitter...
            </p>

            {/* Live Progress pill */}
            <div className="w-full p-3 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 flex items-center justify-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300">
              <Loader2 className="w-4 h-4 animate-spin shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="truncate">{progressText || "Acquiring satellite locks..."}</span>
            </div>

            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-3 italic">
              Please hold your device steady for 2–3 seconds.
            </p>
          </div>
        )}

        {/* ========================================================= */}
        {/* STATE 2: SUCCESS (Location Calibrated & Locked)            */}
        {/* ========================================================= */}
        {status === "success" && (
          <div className="relative flex flex-col items-center text-center">
            {/* Green Success Badge with Glow */}
            <div className="relative w-16 h-16 mb-3.5 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 dark:bg-emerald-500/30 animate-ping opacity-60" />
              <div className="relative z-10 w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 text-white border-2 border-white dark:border-slate-900">
                <Check className="w-7 h-7 stroke-[2.5]" />
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              Classroom GPS Locked!
            </h3>
            <p className="text-xs text-gray-600 dark:text-slate-400 mb-4">
              High-precision classroom coordinates calibrated for this session.
            </p>

            {/* Accuracy Pill */}
            {accuracy !== undefined && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 text-xs font-semibold mb-4 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Accuracy: ±{accuracy}m (High-Precision Fix)</span>
              </div>
            )}

            {/* Coordinates & Metadata Card */}
            <div className="w-full bg-gray-50/90 dark:bg-slate-950/70 border border-gray-200 dark:border-slate-800 rounded-2xl p-4 text-left space-y-2.5 mb-4 shadow-inner">
              {/* Classroom Name & Radius */}
              <div className="flex items-center justify-between pb-2 border-b border-gray-200/80 dark:border-slate-800/80">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate max-w-[190px]">
                    {campusName || "Classroom / Hall"}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-500/30">
                  {radiusMeters}m Radius
                </span>
              </div>

              {/* Coordinates */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-slate-500">
                    GPS Coordinates
                  </p>
                  <p className="font-mono text-xs font-semibold text-gray-900 dark:text-slate-100 mt-0.5">
                    {latitude?.toFixed(6)}, {longitude?.toFixed(6)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCoords}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Copy coordinates"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* Google Maps Link */}
              {googleMapsUrl && (
                <div className="pt-1.5 border-t border-gray-200/60 dark:border-slate-800/60 flex items-center justify-end">
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <span>View on Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Security Notice */}
            <div className="w-full flex items-start gap-2 p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 text-left text-[11px] text-blue-700 dark:text-blue-300 mb-5">
              <ShieldCheck className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
              <span>
                Students must be physically within <strong>{radiusMeters}m</strong> of this classroom to submit selfie attendance. Submissions from home or hostel will be strictly blocked.
              </span>
            </div>

            {/* Confirmation Action Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-emerald-600/30 focus:outline-none transition-all flex items-center justify-center gap-2 transform active:scale-[0.99] cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Done & Apply to Session</span>
            </button>
          </div>
        )}

        {/* ========================================================= */}
        {/* STATE 3: ERROR (Location Capture Failed)                  */}
        {/* ========================================================= */}
        {status === "error" && (
          <div className="relative flex flex-col items-center text-center">
            {/* Red / Amber Error Icon */}
            <div className="w-14 h-14 rounded-full bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3.5 shadow-sm">
              <AlertCircle className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              Location Capture Failed
            </h3>

            <p className="text-xs text-gray-600 dark:text-slate-400 max-w-xs mb-4">
              {errorMessage || "Unable to acquire high-precision GPS coordinates from your device."}
            </p>

            <div className="w-full p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 text-left text-[11px] text-amber-800 dark:text-amber-300 mb-5 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Tips to resolve:</span>
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-700 dark:text-amber-300/90 pl-1">
                <li>Make sure location permission is set to <strong>"Allow"</strong> in your browser settings.</li>
                <li>Ensure device location/GPS is switched on.</li>
                <li>If indoors, move closer to a window for satellite visibility.</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="w-full flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
