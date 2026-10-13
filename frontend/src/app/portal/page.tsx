"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  GraduationCap, BookOpen, CheckCircle2, AlertTriangle, XCircle,
  Calendar, Clock, MapPin, Smartphone, Shield, LogOut, KeyRound,
  RefreshCw, ChevronRight, User, Sparkles, Check, ArrowUpRight
} from "lucide-react";
import { useAuth } from "@/lib/auth";

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
    status: "Eligible" | "Borderline" | "At Risk";
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
  const [pinLoading, setPinLoading] = useState(false);
  const [pinMessage, setPinMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchPortalData = useCallback(async (rollQuery?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = rollQuery ? `/api/student/portal-data?roll=${encodeURIComponent(rollQuery)}` : "/api/student/portal-data";
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load portal data");
      }
      setData(json);
      if (json.student?.studentRoll) {
        setSelectedRoll(json.student.studentRoll);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load attendance portal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortalData();

    // Auto re-fetch latest attendance data when user switches back to this tab
    const handleFocus = () => {
      fetchPortalData(selectedRoll || undefined);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchPortalData, selectedRoll]);

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

    if (!/^\d{6}$/.test(newPin.trim())) {
      setPinMessage({ type: "error", text: "PIN must be exactly 6 digits (e.g. 950426)." });
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
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070B12] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 animate-pulse shadow-xl shadow-indigo-500/10">
          <GraduationCap className="w-8 h-8" />
        </div>
        <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Synchronizing Medical Attendance Portal...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#070B12] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Portal Access Error</h2>
          <p className="text-xs text-slate-400 mb-6">{error || "Unable to retrieve student records."}</p>
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <button
              onClick={() => fetchPortalData(selectedRoll)}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer"
            >
              Retry
            </button>
            {user?.role !== "Student" && (
              <Link
                href="/"
                className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all text-center"
              >
                Dashboard
              </Link>
            )}
            <button
              onClick={() => logout()}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
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
    <div className="min-h-screen bg-[#070B12] text-slate-100 pb-16 selection:bg-indigo-500 selection:text-white">
      {/* Top Header Navbar */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white tracking-tight">MedAttend</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Student Portal
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Academic Attendance & Curriculum Performance</p>
          </div>
        </div>

        {/* Student Quick Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/selfieattend"
            className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all shadow-sm group"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
            <span className="hidden sm:inline">Selfie Attendance</span>
            <span className="sm:hidden text-[11px]">Selfie</span>
          </Link>

          <button
            onClick={() => setIsPinModalOpen(true)}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
            title="Update Security PIN"
          >
            <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Security PIN</span>
          </button>

          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 text-xs font-semibold transition-all cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

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

        {/* Student Identity Hero Card */}
        <div className="bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            {/* Left: Avatar & Metadata */}
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-indigo-500 via-violet-600 to-indigo-700 p-0.5 shadow-xl shadow-indigo-600/20 flex-shrink-0">
                <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center text-indigo-300 font-bold text-2xl">
                  {student.fullName ? student.fullName.charAt(0).toUpperCase() : <User className="w-8 h-8" />}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">{student.fullName}</h1>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Roll: {student.studentRoll}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  <span className="text-slate-300 font-semibold">{student.academicYear} MBBS</span>
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    student.hasFaceEnrolled
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}>
                    {student.hasFaceEnrolled ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {student.hasFaceEnrolled ? "Biometrics Registered" : "Biometrics Pending"}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Exam Eligibility Badge */}
            <div className="flex flex-col items-center justify-center text-center bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5 text-center">
                NMC University Eligibility
              </span>
              <div className="flex items-center justify-center">
                {summary.status === "Eligible" ? (
                  <span className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-sm shadow-inner text-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Eligible for Exams</span>
                  </span>
                ) : summary.status === "Borderline" ? (
                  <span className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-sm shadow-inner text-center">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Borderline (Requires Caution)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-sm shadow-inner text-center">
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Attendance Shortage (&lt;75%)</span>
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5 text-center">
                Minimum 75% required across all departments
              </p>
            </div>
          </div>
        </div>

        {/* 4 Metric KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {/* Card 1: Overall Percentage */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Overall Rate</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                summary.percentage >= 75
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : summary.percentage >= 65
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
              }`}>
                {summary.status}
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {summary.percentage}%
            </div>
            {/* Progress Bar */}
            <div className="mt-3 w-full bg-slate-800 h-2 rounded-full overflow-hidden">
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
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">Total Classes</span>
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">{summary.totalClasses}</div>
            <p className="text-[11px] text-slate-500 mt-2">Delivered to your cohort</p>
          </div>

          {/* Card 3: Classes Attended */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">Attended</span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight">{summary.present}</div>
            <p className="text-[11px] text-slate-500 mt-2">Marked present via AI &amp; Selfie</p>
          </div>

          {/* Card 4: Classes Absent */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">Missed / Absent</span>
            <div className="text-2xl sm:text-3xl font-black text-rose-400 tracking-tight">{summary.absent}</div>
            <p className="text-[11px] text-slate-500 mt-2">Classes not attended</p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Core Feature: Subject-wise Attendance Breakdown Table                     */}
        {/* ========================================================================= */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-3 sm:p-7 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-5">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Subject-wise Attendance Breakdown</h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Detailed subject-by-subject percentage calculation for {student.academicYear} curriculum.
              </p>
            </div>
            <button
              onClick={() => fetchPortalData(selectedRoll)}
              className="self-start sm:self-auto flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {/* The Table Matching User's Screenshot Specification */}
          <div className="rounded-2xl border border-slate-800/90 bg-slate-950/60 shadow-inner overflow-hidden">
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
                <tr className="border-b border-slate-800/80 bg-slate-900/80 text-slate-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">
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
              <tbody className="divide-y divide-slate-800/60">
                {subjects.map((sub, idx) => (
                  <tr
                    key={sub.code || sub.subject || idx}
                    className="hover:bg-slate-900/50 transition-colors"
                  >
                    {/* Subject Name - Clean, without subtitles */}
                    <td className="py-2 sm:py-3.5 px-1.5 sm:px-4">
                      <div className="font-bold text-white text-[11px] sm:text-sm leading-tight break-words">
                        {sub.subject}
                      </div>
                    </td>

                    {/* Total Classes */}
                    <td className="py-2 sm:py-3.5 px-0.5 sm:px-2 text-center font-bold text-slate-300 text-[11px] sm:text-sm">
                      {sub.totalClasses}
                    </td>

                    {/* Attended / Present */}
                    <td className="py-2 sm:py-3.5 px-0.5 sm:px-2 text-center font-bold text-emerald-400 text-[11px] sm:text-sm">
                      {sub.present}
                    </td>

                    {/* Absent */}
                    <td className="py-2 sm:py-3.5 px-0.5 sm:px-2 text-center font-bold text-rose-400 text-[11px] sm:text-sm">
                      {sub.absent}
                    </td>

                    {/* Attendance Percentage */}
                    <td className="py-2 sm:py-3.5 px-0.5 sm:px-2 text-center">
                      <span className="font-black text-white text-[11px] sm:text-sm whitespace-nowrap">
                        {sub.percentage}%
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="py-2 sm:py-3.5 px-0.5 sm:px-2 text-center">
                      {sub.status === "Good" ? (
                        <span className="inline-flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                          <span>Good</span>
                        </span>
                      ) : sub.status === "Borderline" ? (
                        <span className="inline-flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          <span>Border</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                          <span>Low</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {/* Overall Summary Footer Row */}
                <tr className="bg-slate-900/90 font-black border-t-2 border-indigo-500/40 text-xs sm:text-sm">
                  <td className="py-2.5 sm:py-4 px-1.5 sm:px-4 text-white">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="font-black text-[11px] sm:text-sm leading-tight whitespace-nowrap">
                        <span className="sm:inline hidden">Overall </span>Total
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 sm:py-4 px-0.5 sm:px-2 text-center text-white text-[11px] sm:text-sm font-bold">{summary.totalClasses}</td>
                  <td className="py-2.5 sm:py-4 px-0.5 sm:px-2 text-center text-emerald-400 text-[11px] sm:text-sm font-bold">{summary.present}</td>
                  <td className="py-2.5 sm:py-4 px-0.5 sm:px-2 text-center text-rose-400 text-[11px] sm:text-sm font-bold">{summary.absent}</td>
                  <td className="py-2.5 sm:py-4 px-0.5 sm:px-2 text-center text-indigo-300 font-extrabold text-[11px] sm:text-base whitespace-nowrap">
                    {summary.percentage}%
                  </td>
                  <td className="py-2.5 sm:py-4 px-0.5 sm:px-2 text-center">
                    <span className={`inline-flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-black whitespace-nowrap ${
                      summary.status === "Eligible"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : summary.status === "Borderline"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        summary.status === "Eligible" ? "bg-emerald-400" : summary.status === "Borderline" ? "bg-amber-400" : "bg-rose-400"
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
        <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <Calendar className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Recent Class Attendance Log</h2>
                <span className="text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Last 7 Days
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Verification logs from Live Scan AI &amp; GPS Selfie portal (Past 7 days).</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchPortalData(selectedRoll || undefined)}
                disabled={loading}
                className="py-1 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                title="Refresh Logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <Link
                href="/selfieattend"
                className="flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <span>Take Attendance</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {last7DaysSessions.length === 0 ? (
            <div className="text-center py-10 bg-slate-950/40 rounded-2xl border border-slate-800/60">
              <p className="text-xs text-slate-500">No session attendance recorded in the last 7 days.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {last7DaysSessions.map((session, i) => (
                <div
                  key={session.sessionId || i}
                  className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                      session.status === "Present"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}>
                      {session.status === "Present" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs sm:text-sm">{session.subject}</span>
                        <span className="text-[10px] text-slate-500">• {session.venue}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" /> {session.date}
                        </span>
                        {session.startTime && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" /> {formatSessionTime(session.startTime)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                    <span className="text-[11px] font-medium text-slate-400">
                      Mode: <span className="text-slate-200">{session.captureMode}</span>
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      session.status === "Present"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Update 6-Digit PIN</h3>
                <p className="text-[11px] text-slate-400">Used for quick student portal login</p>
              </div>
            </div>

            {pinMessage && (
              <div className={`p-3 rounded-xl mb-4 text-xs font-semibold ${
                pinMessage.type === "success"
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                  : "bg-rose-500/10 border border-rose-500/20 text-rose-300"
              }`}>
                {pinMessage.text}
              </div>
            )}

            <form onSubmit={handleUpdatePin} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-400">New 6-Digit PIN</label>
                  <button
                    type="button"
                    onClick={generateRandomPin}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                  >
                    🎲 Random PIN
                  </button>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  required
                  pattern="[0-9]{6}"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 950426"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-center text-lg tracking-widest focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pinLoading || newPin.length !== 6}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 cursor-pointer transition-all"
                >
                  {pinLoading ? "Saving..." : "Save PIN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
