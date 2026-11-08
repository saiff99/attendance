"use client";

import { memo } from "react";
import { Camera, MapPin, Navigation, Loader2, RotateCcw } from "lucide-react";
import type { CampusGeofenceConfig } from "@/lib/geofence";
import { DEFAULT_GEOFENCE_CONFIG } from "@/lib/geofence";
import type { AcademicSubject } from "@/lib/academicSubjects";

export interface SessionSetupFormProps {
  setupData: {
    subject: string;
    hall: string;
    topic: string;
    academic_year: string;
    sub_batch: string;
  };
  setSetupData: React.Dispatch<
    React.SetStateAction<{
      subject: string;
      hall: string;
      topic: string;
      academic_year: string;
      sub_batch: string;
    }>
  >;
  customHallName: string;
  setCustomHallName: (name: string) => void;
  availableCohortSubjects: AcademicSubject[];
  onCohortChange: (cohort: string) => void;
  sessionGeofence: CampusGeofenceConfig;
  onToggleGeofence: (enabled: boolean) => void;
  onStartGpsCalibration: () => void;
  onResetGeofence: () => void;
  capturingSessionGPS: boolean;
  isStartingSession: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export const SessionSetupForm = memo(function SessionSetupForm({
  setupData,
  setSetupData,
  customHallName,
  setCustomHallName,
  availableCohortSubjects,
  onCohortChange,
  sessionGeofence,
  onToggleGeofence,
  onStartGpsCalibration,
  onResetGeofence,
  capturingSessionGPS,
  isStartingSession,
  onSubmit,
}: SessionSetupFormProps) {
  return (
    <div className="w-full min-h-screen bg-gray-50 dark:bg-[#070B12] text-gray-900 dark:text-slate-100 flex items-center justify-center p-3 sm:p-6 transition-colors duration-300">
      <div className="bg-white dark:bg-slate-900/90 backdrop-blur-2xl border border-gray-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-xl dark:shadow-2xl max-w-xl w-full p-5 sm:p-8 relative overflow-hidden transition-colors duration-300">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-32 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />

        <div className="text-center mb-6 sm:mb-8 relative z-10">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3.5 text-indigo-600 dark:text-indigo-400 shadow-inner">
            <Camera className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Start Attendance Session
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1.5 sm:mt-2">
            Initialize lecture attendance with 6-camera synchronized AI tracking.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5 sm:space-y-4 relative z-10">
          {/* 1. Target Student Cohort & Sub-Group (Hierarchy Parent) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="academic_year" className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5 flex items-center justify-between">
                <span>Target Student Cohort</span>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">Step 1</span>
              </label>
              <select
                id="academic_year"
                className="w-full rounded-xl border border-gray-300 dark:border-slate-800 py-2.5 sm:py-3 px-3.5 sm:px-4 text-gray-900 dark:text-white bg-white dark:bg-slate-950/70 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-1 focus:ring-indigo-600 dark:focus:ring-indigo-500 transition-all text-base sm:text-sm cursor-pointer shadow-sm"
                value={setupData.academic_year}
                onChange={(e) => onCohortChange(e.target.value)}
              >
                <option value="1st Year" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">1st Year MBBS</option>
                <option value="2nd Year" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">2nd Year MBBS</option>
                <option value="3rd Year" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">3rd Year MBBS</option>
                <option value="4th Year" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">4th Year MBBS</option>
              </select>
            </div>

            <div>
              <label htmlFor="sub_batch" className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
                Sub-Group / Section
              </label>
              <select
                id="sub_batch"
                disabled={setupData.academic_year === "All"}
                className="w-full rounded-xl border border-gray-300 dark:border-slate-800 py-2.5 sm:py-3 px-3.5 sm:px-4 text-gray-900 dark:text-white bg-white dark:bg-slate-950/70 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-1 focus:ring-indigo-600 dark:focus:ring-indigo-500 transition-all text-base sm:text-sm cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                value={setupData.sub_batch}
                onChange={(e) => setSetupData((prev) => ({ ...prev, sub_batch: e.target.value }))}
              >
                <option value="All" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">All Group</option>
                <option value="Group A" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">Group A</option>
                <option value="Group B" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">Group B</option>
                <option value="Group C" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">Group C</option>
              </select>
            </div>
          </div>

          {/* 2. Subject / Department (Filtered dynamically based on Cohort) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="subject" className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400">
                Subject / Department
              </label>
              <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                {setupData.academic_year === "All" ? "All Subjects" : `${setupData.academic_year} Curriculum`} ({availableCohortSubjects.length} subjects)
              </span>
            </div>
            <select
              id="subject"
              required
              className="w-full rounded-xl border border-gray-300 dark:border-slate-800 py-2.5 sm:py-3 px-3.5 sm:px-4 text-gray-900 dark:text-white bg-white dark:bg-slate-950/70 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-1 focus:ring-indigo-600 dark:focus:ring-indigo-500 transition-all text-base sm:text-sm cursor-pointer shadow-sm"
              value={setupData.subject}
              onChange={(e) => setSetupData((prev) => ({ ...prev, subject: e.target.value }))}
            >
              {availableCohortSubjects.length > 0 ? (
                availableCohortSubjects.map((sub) => (
                  <option key={sub.id || `${sub.academic_year}-${sub.name}`} value={sub.name} className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">
                    {sub.code ? `${sub.name} (${sub.code})` : sub.name} {setupData.academic_year === "All" ? `— [${sub.academic_year}]` : ""}
                  </option>
                ))
              ) : (
                <option value="General" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">
                  General Session
                </option>
              )}
            </select>
          </div>

          <div>
            <label htmlFor="hall" className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
              Lecture / Examination Hall
            </label>
            <select
              id="hall"
              className="w-full rounded-xl border border-gray-300 dark:border-slate-800 py-2.5 sm:py-3 px-3.5 sm:px-4 text-gray-900 dark:text-white bg-white dark:bg-slate-950/70 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-1 focus:ring-indigo-600 dark:focus:ring-indigo-500 transition-all text-base sm:text-sm cursor-pointer shadow-sm"
              value={setupData.hall}
              onChange={(e) => setSetupData((prev) => ({ ...prev, hall: e.target.value }))}
            >
              <option value="Lecture Hall 1" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">Lecture Hall 1</option>
              <option value="Lecture Hall 2" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">Lecture Hall 2</option>
              <option value="Lecture Hall 3" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">Lecture Hall 3</option>
              <option value="Lecture Hall 4" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">Lecture Hall 4</option>
              <option value="custom" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white">Others Classroom</option>
            </select>

            {setupData.hall === "custom" && (
              <div className="mt-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <label htmlFor="custom-hall" className="block text-[11px] font-medium text-indigo-600 dark:text-indigo-400 mb-1">
                  Enter Classroom / Demo Room Name:
                </label>
                <input
                  id="custom-hall"
                  required
                  type="text"
                  className="w-full rounded-xl border border-indigo-300 dark:border-indigo-500/50 py-2 sm:py-2.5 px-3.5 text-gray-900 dark:text-white bg-white dark:bg-slate-950/90 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-base sm:text-sm shadow-inner"
                  value={customHallName}
                  onChange={(e) => setCustomHallName(e.target.value)}
                  placeholder="e.g. Anatomy Demo, Physiology Demo, Biochemistry Lab..."
                  autoFocus
                />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="topic" className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
              Topic / Professor Name
            </label>
            <input
              id="topic"
              required
              type="text"
              className="w-full rounded-xl border border-gray-300 dark:border-slate-800 py-2.5 sm:py-3 px-3.5 sm:px-4 text-gray-900 dark:text-white bg-white dark:bg-slate-950/70 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-1 focus:ring-indigo-600 dark:focus:ring-indigo-500 transition-all text-base sm:text-sm shadow-sm"
              value={setupData.topic}
              onChange={(e) => setSetupData((prev) => ({ ...prev, topic: e.target.value }))}
              placeholder="e.g. Prof. Dr. A. K. Rahman - Cardiovascular Pathology"
            />
          </div>

          {/* GPS Geofence Security Card */}
          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-slate-950/70 border border-gray-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${sessionGeofence.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400"}`}>
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">Classroom GPS Shield</p>
                    {sessionGeofence.enabled ? (
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold border border-emerald-300 dark:border-emerald-500/30">Active ({sessionGeofence.radiusMeters}m)</span>
                    ) : (
                      <span className="text-[10px] bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-semibold border border-amber-300 dark:border-amber-500/30">Disabled (Open Everywhere)</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                    {sessionGeofence.enabled
                      ? `Restricts selfie attendance to ${sessionGeofence.radiusMeters}m of this room.`
                      : "Students can submit selfie attendance without GPS distance restriction."}
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={sessionGeofence.enabled}
                  onChange={(e) => onToggleGeofence(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {sessionGeofence.enabled && (
              <div className="flex items-center justify-between pt-1.5 border-t border-gray-200/60 dark:border-slate-800/80">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onStartGpsCalibration}
                    disabled={capturingSessionGPS}
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {capturingSessionGPS ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
                    <span>Set Classroom GPS to Current Location</span>
                  </button>

                  {(sessionGeofence.latitude !== DEFAULT_GEOFENCE_CONFIG.latitude || sessionGeofence.longitude !== DEFAULT_GEOFENCE_CONFIG.longitude) && (
                    <button
                      type="button"
                      onClick={onResetGeofence}
                      className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300 flex items-center gap-1 cursor-pointer"
                      title="Reset to campus main building default"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>

                <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">
                  {sessionGeofence.latitude.toFixed(4)}, {sessionGeofence.longitude.toFixed(4)}
                </span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isStartingSession}
            className="w-full py-3 sm:py-3.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer"
          >
            {isStartingSession ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Initializing 6-Cam AI Vision Hub...</span>
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                <span>Launch Live Attendance Session</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
});

