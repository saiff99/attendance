"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  GraduationCap, BookOpen, CheckCircle2, AlertTriangle, XCircle,
  Calendar, Clock, MapPin, Smartphone, Shield, LogOut, KeyRound,
  RefreshCw, ChevronRight, User, Sparkles, Check, ArrowUpRight, Camera, ShieldCheck,
  Eye, EyeOff, Bell, WifiOff, Sun, Moon,
  Calculator, TrendingUp, Sliders, Info
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "next-themes";
import { FaceRegistrationModal } from "@/components/FaceRegistrationModal";

interface SubjectRow {
  subject: string;
  code: string;
  department: string;
  totalClasses: number;
  present: number;
  absent: number;
  percentage: number;
  status: "Good" | "Borderline" | "Low";
}

interface RecentSession {
  sessionId: string;
  className: string;
  subject: string;
  venue: string;
  date: string;
  startTime: string;
  instructor: string;
  status: "Present" | "Absent";
  captureMode: string;
  recordedAt: string | null;
}

interface PortalData {
  viewerRole?: "Super Admin" | "Faculty" | "Student";
  adminStudentList?: { roll: string; name: string; year: string }[];
  student: {
    id: string;
    fullName: string;
    studentRoll: string;
    academicYear: string;
    email: string;
    parentPhone: string;
    hasFaceEnrolled: boolean;
    hasCustomPin: boolean;
  };
  summary: {
    totalClasses: number;
    present: number;
    absent: number;
    percentage: number;
    status: "Eligible" | "Borderline" | "Risk" | "At Risk";
    isExamEligible: boolean;
  };
  subjects: SubjectRow[];
  recentSessions: RecentSession[];
}

function formatSessionTime(isoString?: string | null): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return isoString;
  }
}

export default function StudentPortalPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<PortalData | null>(null);
  const [selectedRoll, setSelectedRoll] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PIN modal state
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showOldPin, setShowOldPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinMessage, setPinMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Face ID Biometric Registration modal state
  const [isFaceModalOpen, setIsFaceModalOpen] = useState(false);

  // PWA Offline Status & Push Notification States
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");

  // Color Theme State
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  // NMC 75% Predictive Calculator State
  const [calcSubjectScope, setCalcSubjectScope] = useState<string>("ALL");
  const [simUpcomingClasses, setSimUpcomingClasses] = useState<number>(10);
  const [simAttendedClasses, setSimAttendedClasses] = useState<number>(10);

  const calcMetrics = useMemo(() => {
    if (!data) return null;
    let present = data.summary.present;
    let total = data.summary.totalClasses;
    let label = "Overall Curriculum";

    if (calcSubjectScope !== "ALL") {
      const found = data.subjects.find((s) => (s.code || s.subject) === calcSubjectScope);
      if (found) {
        present = found.present;
        total = found.totalClasses;
        label = found.subject;
      }
    }

    const currentPct = total > 0 ? Math.round((present / total) * 1000) / 10 : 100;

    // Consecutive classes needed to reach 75%
    // (P + X) / (T + X) >= 0.75  =>  0.25X >= 0.75T - P  =>  X >= 3T - 4P
    const neededFor75 = currentPct < 75 ? Math.max(0, Math.ceil(3 * total - 4 * present)) : 0;

    // Safe absence buffer before dropping below 75%
    // P / (T + Y) >= 0.75  =>  0.75Y <= P - 0.75T  =>  Y <= (4P - 3T) / 3
    const safeBunkBuffer = currentPct >= 75 ? Math.max(0, Math.floor((4 * present - 3 * total) / 3)) : 0;

    // Simulated scenario
    const validSimUpcoming = Math.max(1, simUpcomingClasses);
    const validSimAttended = Math.min(validSimUpcoming, Math.max(0, simAttendedClasses));
    const simTotal = total + validSimUpcoming;
    const simPresent = present + validSimAttended;
    const simPct = simTotal > 0 ? Math.round((simPresent / simTotal) * 1000) / 10 : 0;
    const simDelta = Math.round((simPct - currentPct) * 10) / 10;

    return {
      label,
      present,
      total,
      currentPct,
      neededFor75,
      safeBunkBuffer,
      validSimUpcoming,
      validSimAttended,
      simTotal,
      simPresent,
      simPct,
      simDelta,
      isSimEligible: simPct >= 75,
    };
  }, [data, calcSubjectScope, simUpcomingClasses, simAttendedClasses]);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      if ("Notification" in window) {
        setNotificationPermission(Notification.permission);
      } else {
        setNotificationPermission("unsupported");
      }

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  const requestNotificationAccess = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === "granted" && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification("MedAttend AI", {
          body: "Attendance alerts enabled! You will receive live check-in notifications.",
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-192x192.png",
        });
      }
    } catch (e) {
      console.warn("Notification permission error:", e);
    }
  };

  const fetchPortalData = useCallback(async (rollQuery?: string, isSilent = false) => {
    // Only show full-screen loader on initial fetch when there is no data
    if (!isSilent) {
      setLoading(true);
    }
    setError(null);
    const startTime = Date.now();
    try {
      const url = rollQuery ? `/api/student/portal-data?roll=${encodeURIComponent(rollQuery)}` : "/api/student/portal-data";
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load portal data");
      }
      setData(json);
      if (json.student?.studentRoll) {
        setSelectedRoll((prev) => prev || json.student.studentRoll);
      }
    } catch (err: any) {
      if (!isSilent) {
        setError(err.message || "Failed to load attendance portal.");
      }
    } finally {
      if (!isSilent) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 600) {
          await new Promise((resolve) => setTimeout(resolve, 600 - elapsed));
        }
      }
      setLoading(false);
    }
  }, []);

  // 1. Initial mount fetch: executes strictly once without re-triggering on roll state change
  useEffect(() => {
    fetchPortalData();
  }, [fetchPortalData]);

  // Keep a stable ref of selectedRoll for window focus events without causing re-renders
  const selectedRollRef = useRef(selectedRoll);
  useEffect(() => {
    selectedRollRef.current = selectedRoll;
  }, [selectedRoll]);

  // 2. Window focus listener: silently refreshes in the background without unmounting the UI
  useEffect(() => {
    const handleFocus = () => {
      fetchPortalData(selectedRollRef.current || undefined, true);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchPortalData]);

  // Strictly filter Recent Class Attendance to the last 7 days (Top-level hook complying with React Rules of Hooks)
  const last7DaysSessions = useMemo(() => {
    const list = data?.recentSessions;
    if (!list || list.length === 0) return [];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const cutoff = sevenDaysAgo.getTime();

    return list.filter((sess) => {
      const recordedTime = sess.recordedAt ? new Date(sess.recordedAt).getTime() : 0;
      const startTime = sess.startTime ? new Date(sess.startTime).getTime() : 0;
      let dateTime = 0;
      if (sess.date) {
        const dStr = sess.date.includes("T") ? sess.date : `${sess.date}T00:00:00`;
        dateTime = new Date(dStr).getTime();
      }
      const sessionTime = Math.max(
        isNaN(recordedTime) ? 0 : recordedTime,
        isNaN(startTime) ? 0 : startTime,
        isNaN(dateTime) ? 0 : dateTime
      );
      return sessionTime >= cutoff;
    });
  }, [data?.recentSessions]);

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinLoading(true);
    setPinMessage(null);

    if (!/^\d{6}$/.test(oldPin.trim())) {
      setPinMessage({ type: "error", text: "Please enter your current 6-digit PIN." });
      setPinLoading(false);
      return;
    }

    if (!/^\d{6}$/.test(newPin.trim())) {
      setPinMessage({ type: "error", text: "New PIN must be exactly 6 digits (e.g. 950426)." });
      setPinLoading(false);
      return;
    }

    if (newPin.trim() === oldPin.trim()) {
      setPinMessage({ type: "error", text: "New PIN must be different from your current PIN." });
      setPinLoading(false);
      return;
    }

    if (newPin.trim() !== confirmPin.trim()) {
      setPinMessage({ type: "error", text: "New PIN and Confirm PIN do not match." });
      setPinLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/student/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPin, newPin }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Failed to update PIN");
      }

      // Immediately update student state so the initial setup banner vanishes instantly
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          student: {
            ...prev.student,
            hasCustomPin: true,
          },
        };
      });

      setPinMessage({ type: "success", text: "Security PIN updated successfully!" });
      setTimeout(() => {
        setIsPinModalOpen(false);
        setOldPin("");
        setNewPin("");
        setConfirmPin("");
        setShowOldPin(false);
        setShowNewPin(false);
        setShowConfirmPin(false);
        setPinMessage(null);
      }, 700);
    } catch (err: any) {
      setPinMessage({ type: "error", text: err.message || "Could not update PIN." });
    } finally {
      setPinLoading(false);
    }
  };

  const generateRandomPin = () => {
    const random = Math.floor(100000 + Math.random() * 900000).toString();
    setNewPin(random);
    setShowNewPin(true);
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#060911] text-slate-800 dark:text-slate-100 flex flex-col items-center justify-between p-6 sm:p-10 relative overflow-hidden select-none transition-colors duration-200">
        {/* Ambient Glowing Atmospheric Aura */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[480px] h-[340px] sm:h-[480px] bg-gradient-to-tr from-indigo-500/15 dark:from-indigo-600/20 via-violet-500/10 dark:via-violet-600/15 to-teal-500/10 rounded-full blur-[110px] pointer-events-none" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-48 h-48 bg-indigo-500/10 dark:bg-indigo-500/15 rounded-full blur-[70px] pointer-events-none" />

        {/* Top Live Sync Pill */}
        <div className="w-full flex justify-end relative z-10">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-600 dark:text-slate-400 backdrop-blur-md shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping" />
            <span>Live Sync</span>
          </div>
        </div>

        {/* Center Hero Emblem & Progress Experience */}
        <div className="flex flex-col items-center text-center relative z-10 max-w-sm w-full my-auto">
          {/* Layered Glassmorphic Shield Emblem with Pulse Aura */}
          <div className="relative mb-6">
            <div className="absolute -inset-3 rounded-3xl bg-gradient-to-r from-indigo-500/25 via-violet-500/20 to-teal-500/25 blur-xl animate-pulse" />
            <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300 dark:from-slate-800 dark:via-slate-900 dark:to-slate-950 p-0.5 shadow-xl dark:shadow-2xl border border-slate-200 dark:border-slate-700/60 flex items-center justify-center">
              <div className="w-full h-full rounded-[14px] bg-white dark:bg-gradient-to-br dark:from-indigo-600/20 dark:via-slate-950 dark:to-slate-950 flex items-center justify-center shadow-inner relative overflow-hidden">
                <GraduationCap className="w-10 h-10 text-indigo-600 dark:text-indigo-400 drop-shadow-[0_2px_12px_rgba(99,102,241,0.5)]" />
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 dark:bg-emerald-400 border-2 border-white dark:border-[#060911] shadow-[0_0_8px_#10b981]" />
              </div>
            </div>
          </div>

          {/* Typography & Institutional Badging */}
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center justify-center gap-2">
            MedAttend
            <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-lg bg-indigo-500/15 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30">
              AI
            </span>
          </h1>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mt-1">
            Medical Student Portal
          </p>

          {/* Sleek Indeterminate Shimmer Progress Bar */}
          <div className="mt-7 w-full max-w-[240px] flex flex-col items-center gap-3">
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden relative border border-slate-300/80 dark:border-slate-800 shadow-inner">
              <div className="absolute inset-y-0 w-28 bg-gradient-to-r from-transparent via-indigo-500 to-teal-300 rounded-full animate-shimmer-slide" />
            </div>

            <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-300/90 font-medium">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500 dark:text-indigo-400" />
              <span>Synchronizing Academic Records...</span>
            </div>
          </div>
        </div>

        {/* Bottom Trust Badge */}
        <div className="relative z-10 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md text-[11px] text-slate-600 dark:text-slate-400 font-medium shadow-sm">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
          <span>NMC Verified • End-to-End Encrypted</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#070B12] text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-4 transition-colors duration-200">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 text-center shadow-xl dark:shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Portal Access Error</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">{error || "Unable to retrieve student records."}</p>
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <button
              onClick={() => fetchPortalData(selectedRoll)}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-md shadow-indigo-600/20"
            >
              Retry
            </button>
            {user?.role !== "Student" && (
              <Link
                href="/"
                className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all text-center border border-slate-200 dark:border-transparent"
              >
                Dashboard
              </Link>
            )}
            <button
              onClick={() => logout()}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all cursor-pointer border border-slate-200 dark:border-transparent"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { student, summary, subjects } = data;
  const isElevatedViewer = data.viewerRole === "Super Admin" || data.viewerRole === "Faculty" || user?.role === "Super Admin" || user?.role === "Faculty";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070B12] text-slate-900 dark:text-slate-100 pb-16 transition-colors duration-200 selection:bg-indigo-500 selection:text-white">
      {/* Top Header Navbar */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 px-3.5 sm:px-8 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4 transition-colors">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 shrink-0">
            <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight shrink-0">MedAttend</span>
              <span className="hidden sm:inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/15 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 leading-tight shrink-0">
                Student Portal
              </span>
            </div>
            {/* Mobile Subtitle: Stacked directly underneath MedAttend (Zero horizontal collision) */}
            <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 tracking-wide uppercase sm:hidden leading-none mt-0.5">
              Student Portal
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block mt-0.5">Academic Attendance &amp; Curriculum Performance</p>
          </div>
        </div>

        {/* Student Quick Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Quick Theme Toggle Button */}
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="flex items-center justify-center p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer shrink-0 border border-slate-200/90 dark:border-slate-700/60 shadow-sm"
            title={mounted && resolvedTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle color theme"
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            )}
          </button>

          {notificationPermission !== "unsupported" && (
            <button
              onClick={requestNotificationAccess}
              className={`flex items-center gap-1.5 py-1.5 px-2 sm:px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                notificationPermission === "granted"
                  ? "bg-emerald-50 dark:bg-slate-800/80 hover:bg-emerald-100 dark:hover:bg-slate-700 border-emerald-200 dark:border-slate-700/60 text-emerald-600 dark:text-emerald-400"
                  : "bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-300"
              }`}
              title={notificationPermission === "granted" ? "Attendance Push Alerts Active" : "Enable Attendance Push Alerts"}
            >
              <Bell className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">{notificationPermission === "granted" ? "Alerts On" : "Alerts"}</span>
            </button>
          )}

          <Link
            href="/selfieattend"
            className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition-all shadow-sm group shrink-0"
            title="Mark Attendance"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
            <span className="hidden sm:inline">Attendance</span>
            <span className="sm:hidden text-[11px]">Attend</span>
          </Link>

          <button
            onClick={() => setIsPinModalOpen(true)}
            className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white border border-slate-200/80 dark:border-transparent text-xs font-semibold transition-all cursor-pointer shrink-0"
            title="Update Security PIN"
          >
            <KeyRound className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden sm:inline">Security PIN</span>
          </button>

          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 border border-slate-200/80 dark:border-transparent text-xs font-semibold transition-all cursor-pointer shrink-0"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* PWA Offline Mode Notice */}
      {!isOnline && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3.5 py-2 text-center text-xs text-amber-300 font-medium flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Offline Mode: Campus cellular connection dropped. Student profile cached locally.</span>
        </div>
      )}

      {/* Admin Preview Mode Toolbar */}
      {isElevatedViewer && (
        <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900/90 to-indigo-950/80 border-b border-indigo-500/30 px-4 sm:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse ring-4 ring-emerald-500/20" />
            <span className="font-bold text-white tracking-wide">Faculty &amp; Admin Preview</span>
            <span className="text-slate-400 hidden sm:inline">•</span>
            <span className="text-slate-400 hidden sm:inline">Viewing Student Portal as</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold text-[11px]">
              {user?.role || data.viewerRole}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {data.adminStudentList && data.adminStudentList.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 hidden md:inline">Inspect Student:</span>
                <select
                  value={selectedRoll || student.studentRoll}
                  onChange={(e) => {
                    const newRoll = e.target.value;
                    setSelectedRoll(newRoll);
                    fetchPortalData(newRoll);
                  }}
                  className="bg-slate-950 border border-slate-700 hover:border-indigo-500 text-white text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors shadow-inner"
                >
                  {data.adminStudentList.map((st) => (
                    <option key={st.roll} value={st.roll}>
                      Roll {st.roll} - {st.name} ({st.year})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Link
              href="/"
              className="py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1"
            >
              <span>Admin Console</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-6 sm:space-y-8">
        {/* First Time PIN Setup Banner if custom PIN is not yet set */}
        {!student.hasCustomPin && (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-indigo-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 shadow-md">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-300">Initial Setup: Set Your Secret 6-Digit PIN</h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Please create your personal 6-digit PIN. Once saved, this PIN will be your permanent login key.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsPinModalOpen(true)}
              className="w-full sm:w-auto py-2.5 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition-all shrink-0 cursor-pointer text-center"
            >
              Set My Secret PIN
            </button>
          </div>
        )}

        {/* First Time Face ID Setup Banner if face is not yet enrolled */}
        {!student.hasFaceEnrolled && (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-600/10 to-indigo-500/10 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 shadow-md">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-emerald-300">Biometric Onboarding: Register Your Face ID</h3>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    1st Time Setup
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Your Face ID is not yet enrolled. Register your face using our 5-angle camera scan to enable automated classroom attendance and mobile selfie check-in. (One-time registration).
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsFaceModalOpen(true)}
              className="w-full sm:w-auto py-2.5 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition-all shrink-0 cursor-pointer text-center flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Register Face ID Now
            </button>
          </div>
        )}

        {/* Student Identity Hero Card */}
        <div className="bg-white dark:bg-gradient-to-br dark:from-slate-900/90 dark:via-slate-900/80 dark:to-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-lg dark:shadow-2xl relative overflow-hidden backdrop-blur-xl transition-colors">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            {/* Left: Avatar & Metadata */}
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-indigo-500 via-violet-600 to-indigo-700 p-0.5 shadow-xl shadow-indigo-600/20 flex-shrink-0">
                <div className="w-full h-full rounded-[14px] bg-slate-100 dark:bg-slate-950 flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-bold text-2xl">
                  {student.fullName ? student.fullName.charAt(0).toUpperCase() : <User className="w-8 h-8" />}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">{student.fullName}</h1>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-indigo-500/15 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30">
                    Roll: {student.studentRoll}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">{student.academicYear} MBBS</span>
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {student.hasFaceEnrolled ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
                      <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                      Biometrics Registered
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-sm">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                      Biometrics Pending
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Exam Eligibility Badge */}
            <div className="flex flex-col items-center justify-center text-center bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 transition-colors">
              <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1.5 text-center">
                NMC University Eligibility
              </span>
              <div className="flex items-center justify-center">
                {summary.status === "Eligible" ? (
                  <span className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/30 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold text-sm shadow-inner text-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Eligible for Exams</span>
                  </span>
                ) : summary.status === "Borderline" ? (
                  <span className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/15 dark:bg-amber-500/20 border border-amber-500/30 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-sm shadow-inner text-center">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Borderline (Requires Caution)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-500/15 dark:bg-rose-500/20 border border-rose-500/30 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 font-bold text-sm shadow-inner text-center">
                    <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>Attendance Shortage (&lt;75%)</span>
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 text-center">
                Minimum 75% required across all departments
              </p>
            </div>
          </div>
        </div>

        {/* 4 Metric KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {/* Card 1: Overall Percentage */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-xl relative overflow-hidden transition-colors">
            <div className="flex items-center justify-between gap-1.5 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Overall Rate</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                summary.percentage >= 75
                  ? "bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                  : summary.percentage >= 65
                  ? "bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                  : "bg-rose-500/15 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30"
              }`}>
                {summary.status === "At Risk" ? "Risk" : summary.status}
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {summary.percentage}%
            </div>
            {/* Progress Bar */}
            <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  summary.percentage >= 75
                    ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                    : summary.percentage >= 65
                    ? "bg-gradient-to-r from-amber-500 to-orange-400"
                    : "bg-gradient-to-r from-rose-500 to-red-400"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, summary.percentage))}%` }}
              />
            </div>
          </div>

          {/* Card 2: Total Classes */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-xl transition-colors">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">Total Classes</span>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">{summary.totalClasses}</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Delivered to your cohort</p>
          </div>

          {/* Card 3: Classes Attended */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-xl transition-colors">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">Attended</span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">{summary.present}</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Marked present via AI &amp; Selfie</p>
          </div>

          {/* Card 4: Classes Absent */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-xl transition-colors">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">Absent</span>
            <div className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 tracking-tight">{summary.absent}</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Classes not attended</p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Feature: Smart NMC 75% Attendance Predictor & Recovery Calculator         */}
        {/* ========================================================================= */}
        <section className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 sm:p-7 shadow-lg dark:shadow-2xl relative overflow-hidden backdrop-blur-xl transition-colors">
          {/* Ambient Decorative Gradient */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 relative z-10">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/20">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                    NMC 75% Attendance Predictor &amp; Calculator
                  </h2>
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/15 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30">
                    <Sparkles className="w-3 h-3 text-indigo-500" />
                    AI Simulator
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Real-time shortage recovery targets &amp; safe absence buffer under National Medical Commission guidelines.
                </p>
              </div>
            </div>

            {/* Scope / Subject Filter */}
            <div className="flex items-center gap-2 self-start md:self-auto shrink-0 w-full md:w-auto">
              <label htmlFor="nmc-calc-scope" className="text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                Target Subject:
              </label>
              <select
                id="nmc-calc-scope"
                value={calcSubjectScope}
                onChange={(e) => setCalcSubjectScope(e.target.value)}
                className="w-full md:w-auto px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-base sm:text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer shadow-sm"
              >
                <option value="ALL">Overall Curriculum ({summary.percentage}%)</option>
                {subjects.map((sub, i) => (
                  <option key={sub.code || sub.subject || i} value={sub.code || sub.subject}>
                    {sub.subject} ({sub.percentage}%)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {calcMetrics && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10">
              {/* Left Column (5 Cols): Target Status & Guidance Card */}
              <div className="lg:col-span-5 flex flex-col justify-between gap-4 bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Curriculum Scope: {calcMetrics.label}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                      {calcMetrics.present} / {calcMetrics.total} classes ({calcMetrics.currentPct}%)
                    </span>
                  </div>

                  {calcMetrics.currentPct < 75 ? (
                    /* SHORTAGE WARNING CARD */
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 dark:bg-rose-950/30 p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 block">
                            Attendance Shortage Alert (&lt;75%)
                          </span>
                          <div className="mt-1 flex items-baseline gap-2">
                            <span className="text-3xl font-black text-rose-600 dark:text-rose-400">
                              +{calcMetrics.neededFor75}
                            </span>
                            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                              consecutive classes needed
                            </span>
                          </div>
                          <p className="text-xs text-rose-800/90 dark:text-rose-200/80 mt-2 leading-relaxed">
                            To reach the mandatory 75% NMC exam eligibility mark, you must attend the next{" "}
                            <strong className="underline decoration-rose-500 font-bold">
                              {calcMetrics.neededFor75} classes
                            </strong>{" "}
                            without missing any.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* SAFE BUFFER ZONE CARD */
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/30 p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                            NMC Compliant &amp; Safe Zone
                          </span>
                          <div className="mt-1 flex items-baseline gap-2">
                            <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                              {calcMetrics.safeBunkBuffer}
                            </span>
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                              classes safe leave buffer
                            </span>
                          </div>
                          <p className="text-xs text-emerald-800/90 dark:text-emerald-200/80 mt-2 leading-relaxed">
                            {calcMetrics.safeBunkBuffer > 0 ? (
                              <>
                                You can safely miss up to{" "}
                                <strong className="underline decoration-emerald-500 font-bold">
                                  {calcMetrics.safeBunkBuffer} upcoming classes
                                </strong>{" "}
                                for medical emergencies or personal leave without dropping below the statutory 75% threshold.
                              </>
                            ) : (
                              <>
                                You are on the exact 75% border.{" "}
                                <strong className="underline decoration-amber-500 font-bold">
                                  Missing even 1 single upcoming class
                                </strong>{" "}
                                will immediately pull your status into the ineligible zone.
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Regulatory Context */}
                <div className="flex items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
                  <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>National Medical Commission norms mandate 75% theory &amp; practical attendance to sit for MBBS university exams.</span>
                </div>
              </div>

              {/* Right Column (7 Cols): Interactive What-If Simulator */}
              <div className="lg:col-span-7 bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Interactive &quot;What-If&quot; Scenario Simulator
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20 font-semibold">
                      Client-side Instant
                    </span>
                  </div>

                  {/* Slider 1: Total Upcoming Classes to Simulate */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Upcoming Classes to Simulate:
                      </span>
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                        {simUpcomingClasses} classes
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      value={simUpcomingClasses}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 1;
                        setSimUpcomingClasses(val);
                        if (simAttendedClasses > val) {
                          setSimAttendedClasses(val);
                        }
                      }}
                      className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-1">
                      <span>1 class</span>
                      <span>15 classes</span>
                      <span>30 classes</span>
                    </div>
                  </div>

                  {/* Slider 2: Classes Expected to Attend */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Classes You Plan to Attend:
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                        {calcMetrics.validSimAttended} of {calcMetrics.validSimUpcoming} classes ({Math.round((calcMetrics.validSimAttended / calcMetrics.validSimUpcoming) * 100)}%)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={simUpcomingClasses}
                      value={calcMetrics.validSimAttended}
                      onChange={(e) => setSimAttendedClasses(parseInt(e.target.value, 10) || 0)}
                      className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-1">
                      <span>0 (Miss all)</span>
                      <span>{Math.round(simUpcomingClasses / 2)} (Half)</span>
                      <span>{simUpcomingClasses} (Attend all)</span>
                    </div>
                  </div>

                  {/* Preset Shortcuts */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">Presets:</span>
                    <button
                      type="button"
                      onClick={() => setSimAttendedClasses(simUpcomingClasses)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        calcMetrics.validSimAttended === simUpcomingClasses
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                          : "bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      Attend 100%
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimAttendedClasses(Math.round(simUpcomingClasses * 0.8))}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
                    >
                      Attend 80%
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimAttendedClasses(Math.round(simUpcomingClasses * 0.5))}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
                    >
                      Attend 50%
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimAttendedClasses(0)}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
                    >
                      Miss All (0%)
                    </button>
                  </div>
                </div>

                {/* Simulated Outcome Display Card */}
                <div className={`mt-2 rounded-xl border p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                  calcMetrics.isSimEligible
                    ? "bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-900 dark:text-emerald-100"
                    : "bg-rose-500/10 dark:bg-rose-950/30 border-rose-500/30 text-rose-900 dark:text-rose-100"
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      calcMetrics.isSimEligible
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : "bg-rose-500/20 text-rose-600 dark:text-rose-400"
                    }`}>
                      {calcMetrics.isSimEligible ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Projected Attendance Outcome
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black tracking-tight">
                          {calcMetrics.simPct}%
                        </span>
                        <span className={`text-xs font-mono font-bold flex items-center gap-0.5 ${
                          calcMetrics.simDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}>
                          <TrendingUp className={`w-3.5 h-3.5 ${calcMetrics.simDelta < 0 ? "rotate-180" : ""}`} />
                          {calcMetrics.simDelta >= 0 ? `+${calcMetrics.simDelta}%` : `${calcMetrics.simDelta}%`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-start sm:items-end">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                      calcMetrics.isSimEligible
                        ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                        : "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30"
                    }`}>
                      {calcMetrics.isSimEligible ? "✅ Exam Eligible" : "⚠️ Exam Ineligible"}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                      {calcMetrics.simPresent} / {calcMetrics.simTotal} total classes
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ========================================================================= */}
        {/* Core Feature: Subject-wise Attendance Breakdown Table                     */}
        {/* ========================================================================= */}
        <section className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-3 sm:p-7 shadow-lg dark:shadow-2xl relative overflow-hidden backdrop-blur-xl transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-5">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">Subject-wise Attendance Breakdown</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Detailed subject-by-subject percentage calculation for {student.academicYear} curriculum.
              </p>
            </div>
            <button
              onClick={() => fetchPortalData(selectedRoll)}
              disabled={loading}
              className="self-start sm:self-auto flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-transparent text-xs font-semibold transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* The Table Matching User's Screenshot Specification */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-slate-50/50 dark:bg-slate-950/60 shadow-inner overflow-hidden">
            <table className="w-full table-fixed text-left border-collapse text-xs sm:text-sm">
              <colgroup>
                <col className="w-[30%] sm:w-[28%]" />
                <col className="w-[13%] sm:w-[14%]" />
                <col className="w-[13%] sm:w-[14%]" />
                <col className="w-[13%] sm:w-[14%]" />
                <col className="w-[13%] sm:w-[14%]" />
                <col className="w-[18%] sm:w-[16%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-100/90 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-2.5 sm:py-3 px-1.5 sm:px-4">Subject</th>
                  <th className="py-2.5 sm:py-3 px-0.5 sm:px-2 text-center">
                    <span className="sm:inline hidden">Total</span><span className="sm:hidden">Tot</span>
                  </th>
                  <th className="py-2.5 sm:py-3 px-0.5 sm:px-2 text-center">
                    <span className="sm:inline hidden">Present</span><span className="sm:hidden">Pres</span>
                  </th>
                  <th className="py-2.5 sm:py-3 px-0.5 sm:px-2 text-center">
                    <span className="sm:inline hidden">Absent</span><span className="sm:hidden">Abs</span>
                  </th>
                  <th className="py-2.5 sm:py-3 px-0.5 sm:px-2 text-center">%</th>
                  <th className="py-2.5 sm:py-3 px-0.5 sm:px-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/60">
                {subjects.map((sub, idx) => (
                  <tr
                    key={sub.code || sub.subject || idx}
                    className="hover:bg-slate-100/60 dark:hover:bg-slate-900/50 transition-colors"
                  >
                    {/* Subject Name - Clean, without subtitles */}
                    <td className="py-2 sm:py-3.5 px-1.5 sm:px-4">
                      <div className="font-bold text-slate-900 dark:text-white text-[11px] sm:text-sm leading-tight break-words">
                        {sub.subject}
                      </div>
                    </td>

                    {/* Total Classes */}
                    <td className="py-2 sm:py-3.5 px-0.5 sm:px-2 text-center font-bold text-slate-700 dark:text-slate-300 text-[11px] sm:text-sm">
                      {sub.totalClasses}
                    </td>

                    {/* Attended / Present */}
                    <td className="py-2 sm:py-3.5 px-0.5 sm:px-2 text-center font-bold text-emerald-600 dark:text-emerald-400 text-[11px] sm:text-sm">
                      {sub.present}
                    </td>

                    {/* Absent */}
                    <td className="py-2 sm:py-3.5 px-0.5 sm:px-2 text-center font-bold text-rose-600 dark:text-rose-400 text-[11px] sm:text-sm">
                      {sub.absent}
                    </td>

                    {/* Attendance Percentage */}
                    <td className="py-2 sm:py-3.5 px-0.5 sm:px-2 text-center">
                      <span className="font-black text-slate-900 dark:text-white text-[11px] sm:text-sm whitespace-nowrap">
                        {sub.percentage}%
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="py-2 sm:py-3.5 px-0.5 sm:px-2 text-center">
                      {sub.status === "Good" ? (
                        <span className="inline-flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse shrink-0" />
                          <span>Good</span>
                        </span>
                      ) : sub.status === "Borderline" ? (
                        <span className="inline-flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0" />
                          <span>Border</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-bold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 shrink-0" />
                          <span>Low</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {/* Overall Summary Footer Row */}
                <tr className="bg-slate-100/90 dark:bg-slate-900/90 font-black border-t-2 border-indigo-500/40 text-xs sm:text-sm">
                  <td className="py-2.5 sm:py-4 px-1.5 sm:px-4 text-slate-900 dark:text-white">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span className="font-black text-[11px] sm:text-sm leading-tight whitespace-nowrap">
                        <span className="sm:inline hidden">Overall </span>Total
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 sm:py-4 px-0.5 sm:px-2 text-center text-slate-900 dark:text-white text-[11px] sm:text-sm font-bold">{summary.totalClasses}</td>
                  <td className="py-2.5 sm:py-4 px-0.5 sm:px-2 text-center text-emerald-600 dark:text-emerald-400 text-[11px] sm:text-sm font-bold">{summary.present}</td>
                  <td className="py-2.5 sm:py-4 px-0.5 sm:px-2 text-center text-rose-600 dark:text-rose-400 text-[11px] sm:text-sm font-bold">{summary.absent}</td>
                  <td className="py-2.5 sm:py-4 px-0.5 sm:px-2 text-center text-indigo-600 dark:text-indigo-300 font-extrabold text-[11px] sm:text-base whitespace-nowrap">
                    {summary.percentage}%
                  </td>
                  <td className="py-2.5 sm:py-4 px-0.5 sm:px-2 text-center">
                    <span className={`inline-flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-black whitespace-nowrap ${
                      summary.status === "Eligible"
                        ? "bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 dark:border-emerald-500/40"
                        : summary.status === "Borderline"
                        ? "bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 dark:border-amber-500/40"
                        : "bg-rose-500/15 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 dark:border-rose-500/40"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        summary.status === "Eligible" ? "bg-emerald-500 dark:bg-emerald-400" : summary.status === "Borderline" ? "bg-amber-500 dark:bg-amber-400" : "bg-rose-500 dark:bg-rose-400"
                      }`} />
                      <span>{summary.status === "Eligible" ? "Eligible" : summary.status === "Borderline" ? "Border" : "Low"}</span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Session Attendance Timeline */}
        <section className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-lg dark:shadow-2xl relative overflow-hidden backdrop-blur-xl transition-colors">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">Recent Class Attendance Log</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Verification logs from Live Scan AI &amp; GPS Selfie portal (Past 7 days).</p>
            </div>
            <button
              onClick={() => fetchPortalData(selectedRoll || undefined)}
              disabled={loading}
              className="shrink-0 flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-transparent text-xs font-semibold transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              title="Refresh Logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {last7DaysSessions.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800/60">
              <p className="text-xs text-slate-500 dark:text-slate-400">No session attendance recorded in the last 7 days.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {last7DaysSessions.map((session, i) => (
                <div
                  key={session.sessionId || i}
                  className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                      session.status === "Present"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                    }`}>
                      {session.status === "Present" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">{session.subject}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">• {session.venue}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400 dark:text-slate-500" /> {session.date}
                        </span>
                        {session.startTime && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" /> {formatSessionTime(session.startTime)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/80 dark:border-slate-800/60">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Mode: <span className="text-slate-800 dark:text-slate-200 font-semibold">{session.captureMode}</span>
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      session.status === "Present"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                    }`}>
                      {session.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Security 6-Digit PIN Modal */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Update 6-Digit PIN</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Used for quick student portal login</p>
              </div>
            </div>

            {pinMessage && (
              <div className={`p-3 rounded-xl mb-4 text-xs font-semibold ${
                pinMessage.type === "success"
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                  : "bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300"
              }`}>
                {pinMessage.text}
              </div>
            )}

            <form onSubmit={handleUpdatePin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Current 6-Digit PIN
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showOldPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={6}
                    required
                    pattern="[0-9]{6}"
                    value={oldPin}
                    onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono text-center text-lg tracking-widest focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPin(!showOldPin)}
                    className="absolute right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                    title={showOldPin ? "Hide PIN" : "Show PIN"}
                    tabIndex={-1}
                  >
                    {showOldPin ? <EyeOff className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Enter your current PIN or temporary activation PIN.</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">New 6-Digit PIN</label>
                  <button
                    type="button"
                    onClick={generateRandomPin}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-semibold cursor-pointer"
                  >
                    🎲 Random PIN
                  </button>
                </div>
                <div className="relative flex items-center">
                  <input
                    type={showNewPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={6}
                    required
                    pattern="[0-9]{6}"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono text-center text-lg tracking-widest focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPin(!showNewPin)}
                    className="absolute right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                    title={showNewPin ? "Hide PIN" : "Show PIN"}
                    tabIndex={-1}
                  >
                    {showNewPin ? <EyeOff className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Confirm New PIN
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showConfirmPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={6}
                    required
                    pattern="[0-9]{6}"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono text-center text-lg tracking-widest focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPin(!showConfirmPin)}
                    className="absolute right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                    title={showConfirmPin ? "Hide PIN" : "Show PIN"}
                    tabIndex={-1}
                  >
                    {showConfirmPin ? <EyeOff className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPinModalOpen(false);
                    setOldPin("");
                    setNewPin("");
                    setConfirmPin("");
                    setShowOldPin(false);
                    setShowNewPin(false);
                    setShowConfirmPin(false);
                    setPinMessage(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer transition-all border border-slate-200 dark:border-transparent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pinLoading || oldPin.length !== 6 || newPin.length !== 6 || confirmPin.length !== 6}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 cursor-pointer transition-all"
                >
                  {pinLoading ? "Saving..." : "Save PIN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5-Angle Face ID Biometric Registration Modal */}
      {student && (
        <FaceRegistrationModal
          isOpen={isFaceModalOpen}
          onClose={() => setIsFaceModalOpen(false)}
          studentId={student.id}
          studentName={student.fullName}
          isSelfEnrollment={true}
          onSuccess={() => {
            fetchPortalData(selectedRoll || undefined, true);
          }}
        />
      )}
    </div>
  );
}
