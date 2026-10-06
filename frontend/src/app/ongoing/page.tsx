/* eslint-disable */
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Radio, Clock, Users, MapPin, Camera, PlayCircle, StopCircle, 
  RefreshCw, CheckCircle2, AlertCircle, ArrowRight, Sparkles,
  QrCode, ExternalLink, ShieldCheck, ChevronRight, Activity, Loader2
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getBackendUrl } from "@/lib/api";
import { decodeSessionMetadata } from "@/lib/geofence";
import { QRCodeSVG } from "qrcode.react";

interface ActiveSessionItem {
  id: string;
  class_name: string;
  date: string;
  start_time: string;
  end_time?: string;
  instructor_name?: string;
  target_academic_year?: string;
  created_at: string;
  attendance_count: number;
  remaining_seconds: number;
  is_expired: boolean;
  window_duration_seconds: number;
}

export default function OngoingSessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ActiveSessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [qrModalSession, setQrModalSession] = useState<ActiveSessionItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch active sessions from backend / Supabase
  const fetchActiveSessions = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      // 1. Try Next.js API route first
      const res = await fetch("/api/active-sessions", {
        headers: { "ngrok-skip-browser-warning": "69420" },
        cache: "no-store"
      });

      if (res.ok) {
        const data = await res.json();
        if (data.sessions) {
          // Filter strictly for sessions that are NOT expired (remaining_seconds > 0)
          const activeOnly = data.sessions.filter((s: ActiveSessionItem) => !s.is_expired && s.remaining_seconds > 0);
          setSessions(activeOnly);
          return;
        }
      }

      // 2. Fallback: Query Supabase directly
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const nowUtc = Date.now();

      const { data: sessionData, error } = await supabase
        .from("sessions")
        .select("id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at")
        .neq("class_name", "__SYSTEM_CONFIG__")
        .eq("date", todayStr)
        .order("created_at", { ascending: false });

      if (!error && sessionData) {
        const enhanced: ActiveSessionItem[] = [];
        for (const s of sessionData) {
          const timeStr = s.start_time || s.created_at;
          if (!timeStr) continue;

          const startMs = new Date(timeStr).getTime();
          const elapsedSec = Math.floor((nowUtc - startMs) / 1000);
          const rem = Math.max(0, 300 - elapsedSec);

          if (rem > 0) {
            // Count attendances
            const { count } = await supabase
              .from("attendance")
              .select("id", { count: "exact", head: true })
              .eq("session_id", s.id);

            enhanced.push({
              ...s,
              attendance_count: count || 0,
              remaining_seconds: rem,
              is_expired: false,
              window_duration_seconds: 300
            });
          }
        }
        setSessions(enhanced);
      }
    } catch (err) {
      console.error("Failed to fetch ongoing sessions:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveSessions();
    const pollInterval = setInterval(() => {
      fetchActiveSessions(true);
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [fetchActiveSessions]);

  // Local 1-second countdown ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setSessions((prevSessions) => {
        return prevSessions
          .map((s) => ({
            ...s,
            remaining_seconds: Math.max(0, s.remaining_seconds - 1)
          }))
          .filter((s) => s.remaining_seconds > 0); // Automatically vanish once 5-minute timer hits 0
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Format seconds to MM:SS
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Open Live Scan Hub for a specific session
  const handleEnterLiveHub = (session: ActiveSessionItem) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("medattend_active_session_id", session.id);
      localStorage.setItem("medattend_active_session_title", session.class_name);
      window.dispatchEvent(new Event("medattend-session-changed"));
    }
    router.push(`/live-scan?session_id=${session.id}`);
  };

  // End Session Early
  const handleEndSessionEarly = async (sessionId: string) => {
    const confirm = window.confirm(
      "Are you sure you want to conclude this attendance session early?\n\nAll recorded attendances will remain saved."
    );
    if (!confirm) return;

    try {
      if (typeof window !== "undefined") {
        const currentSaved = localStorage.getItem("medattend_active_session_id");
        if (currentSaved === sessionId) {
          localStorage.removeItem("medattend_active_session_id");
          localStorage.removeItem("medattend_active_session_title");
          window.dispatchEvent(new Event("medattend-session-changed"));
        }
      }
      // Remove from local UI immediately
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error("Failed to end session:", err);
    }
  };

  const copySelfieLink = (sessionId: string) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${baseUrl}/selfieattend?session_id=${sessionId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(sessionId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="w-full min-h-screen bg-gray-50 dark:bg-[#070B12] text-gray-900 dark:text-slate-100 flex flex-col p-3 sm:p-6 lg:p-8 transition-colors duration-300">
      <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col">
        
        {/* Header section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 sm:mb-8 pb-5 border-b border-gray-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-sm">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2.5">
                <span>Ongoing Sessions</span>
                {sessions.length > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white animate-pulse shadow-sm shadow-rose-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-white mr-1.5" />
                    {sessions.length} Live
                  </span>
                )}
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
              Real-time monitoring of all live 5-minute attendance sessions currently active across lecture halls.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => fetchActiveSessions()}
              disabled={isRefreshing}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-2 shadow-sm transition-all cursor-pointer"
              title="Refresh ongoing sessions"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-600 dark:text-indigo-400" : ""}`} />
              <span>{isRefreshing ? "Refreshing..." : "Sync"}</span>
            </button>

            <Link
              href="/live-scan"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Start New Session</span>
            </Link>
          </div>
        </div>

        {/* Loading Skeleton */}
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4 animate-pulse">
              <Radio className="w-7 h-7" />
            </div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-semibold">Scanning Active Sessions...</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-500">Connecting to live lecture attendance channels</p>
          </div>
        ) : sessions.length === 0 ? (
          /* Empty state: No active sessions */
          <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-14 text-center bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-gray-200 dark:border-slate-800/80 rounded-3xl shadow-sm my-auto max-w-2xl mx-auto w-full">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gray-100 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700/60 flex items-center justify-center text-gray-400 dark:text-slate-500 mb-5 shadow-inner">
              <Radio className="w-8 h-8 sm:w-10 sm:h-10 opacity-60" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2">
              No Active Sessions Running
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
              Attendance sessions automatically conclude and vanish from this view once their 5-minute active window elapses. All attendance logs are safely stored in reports.
            </p>
            <Link
              href="/live-scan"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Launch Live Scan Hub</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          /* Active Sessions Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sessions.map((session) => {
              const decoded = decodeSessionMetadata(session.instructor_name || "");
              const progressPercent = Math.min(100, Math.max(0, (session.remaining_seconds / 300) * 100));
              const isUrgent = session.remaining_seconds <= 60;
              const isWarning = session.remaining_seconds > 60 && session.remaining_seconds <= 120;

              return (
                <div
                  key={session.id}
                  className="bg-white dark:bg-slate-900/90 backdrop-blur-xl border border-gray-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 shadow-md hover:shadow-xl hover:border-indigo-500/40 dark:hover:border-indigo-500/40 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group"
                >
                  {/* Top Ambient Glow */}
                  <div className="absolute top-0 right-0 w-36 h-36 bg-rose-500/5 dark:bg-rose-500/10 blur-2xl rounded-full pointer-events-none" />

                  <div>
                    {/* Header: Class Name & 5-Minute Timer Badge */}
                    <div className="flex items-start justify-between gap-2.5 mb-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                            Live Check-in
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                          {session.class_name}
                        </h3>
                      </div>

                      {/* Real-time Countdown Pill */}
                      <div className={`px-2.5 py-1 rounded-xl font-mono text-xs font-bold border flex items-center gap-1.5 shrink-0 shadow-sm ${
                        isUrgent
                          ? "bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400 animate-pulse"
                          : isWarning
                          ? "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400"
                          : "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                      }`}>
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatTime(session.remaining_seconds)}</span>
                      </div>
                    </div>

                    {/* Progress Bar for 5-minute window */}
                    <div className="mb-4">
                      <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-1000 rounded-full ${
                            isUrgent ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-gray-400 dark:text-slate-500 mt-1">
                        <span>Window: 5 Minutes</span>
                        <span>{formatTime(session.remaining_seconds)} remaining</span>
                      </div>
                    </div>

                    {/* Meta info list */}
                    <div className="space-y-2 text-xs text-gray-600 dark:text-slate-300 mb-5 bg-gray-50/70 dark:bg-slate-950/60 rounded-xl p-3 border border-gray-100 dark:border-slate-800/80">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 dark:text-slate-500 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> Topic / Faculty:
                        </span>
                        <span className="font-semibold text-gray-800 dark:text-slate-200 truncate max-w-[180px]">
                          {decoded.topic || "Regular Lecture"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 dark:text-slate-500 flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5" /> Target Cohort:
                        </span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {session.target_academic_year || "All MBBS Batches"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 dark:text-slate-500 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Present Count:
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {session.attendance_count} Students
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 dark:text-slate-500 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" /> GPS Shield:
                        </span>
                        <span className={`font-semibold ${
                          decoded.geofence?.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                        }`}>
                          {decoded.geofence?.enabled ? `Active (${decoded.geofence.radiusMeters}m)` : "Disabled"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-slate-800">
                    <button
                      onClick={() => handleEnterLiveHub(session)}
                      className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Open Live Scan Hub</span>
                      <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setQrModalSession(session)}
                        className="py-1.5 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-[11px] font-semibold text-gray-700 dark:text-slate-300 flex items-center justify-center gap-1.5 border border-gray-200 dark:border-slate-700/60 transition-all cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Selfie QR</span>
                      </button>

                      <button
                        onClick={() => handleEndSessionEarly(session.id)}
                        className="py-1.5 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-[11px] font-semibold text-rose-700 dark:text-rose-400 flex items-center justify-center gap-1.5 border border-rose-200 dark:border-rose-900/50 transition-all cursor-pointer"
                      >
                        <StopCircle className="w-3.5 h-3.5" />
                        <span>End Session</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Quick Selfie QR Viewer for ongoing session */}
        {qrModalSession && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl relative">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                    Live Selfie QR
                  </span>
                </div>
                <button
                  onClick={() => setQrModalSession(null)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="bg-white p-4 rounded-2xl shadow-inner border border-gray-200 inline-block mb-4">
                <QRCodeSVG
                  value={typeof window !== "undefined" ? `${window.location.origin}/selfieattend?session_id=${qrModalSession.id}` : ""}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>

              <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate mb-1">
                {qrModalSession.class_name}
              </h4>
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                Students can scan this QR with their mobile camera to check in.
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => copySelfieLink(qrModalSession.id)}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800 flex items-center justify-center gap-1.5 transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{copiedId === qrModalSession.id ? "Link Copied!" : "Copy Selfie Link"}</span>
                </button>

                <button
                  onClick={() => {
                    handleEnterLiveHub(qrModalSession);
                    setQrModalSession(null);
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition-all"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Enter Live Scan Hub</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
