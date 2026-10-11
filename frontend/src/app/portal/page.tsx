"use client";

import { useState, useEffect, useCallback } from "react";
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

export default function StudentPortalPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PIN modal state
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinMessage, setPinMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchPortalData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/student/portal-data", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load portal data");
      }
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load attendance portal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortalData();
  }, [fetchPortalData]);

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
      setPinMessage({ type: "success", text: "Security PIN updated successfully!" });
      setTimeout(() => {
        setIsPinModalOpen(false);
        setOldPin("");
        setNewPin("");
        setPinMessage(null);
      }, 1500);
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
          <div className="flex items-center gap-3">
            <button
              onClick={fetchPortalData}
              className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer"
            >
              Retry
            </button>
            <button
              onClick={() => logout()}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { student, summary, subjects, recentSessions } = data;

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
            className="hidden sm:flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all shadow-sm group"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>Selfie Attendance</span>
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

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-6 sm:space-y-8">
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
                <p className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                  <span className="text-slate-300 font-semibold">{student.academicYear} MBBS Cohort</span>
                  <span>•</span>
                  <span>{student.email}</span>
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    student.hasFaceEnrolled
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}>
                    {student.hasFaceEnrolled ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {student.hasFaceEnrolled ? "Biometrics Registered (AI Ready)" : "Biometrics Pending"}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Exam Eligibility Badge */}
            <div className="flex flex-col sm:items-end justify-center bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                NMC University Eligibility
              </span>
              <div className="flex items-center gap-2">
                {summary.status === "Eligible" ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-sm shadow-inner">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Eligible for Exams
                  </span>
                ) : summary.status === "Borderline" ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-sm shadow-inner">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Borderline (Requires Caution)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-sm shadow-inner">
                    <XCircle className="w-4 h-4 text-rose-400" />
                    Attendance Shortage (&lt;75%)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1 sm:text-right">Minimum 75% required across all departments</p>
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
        <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
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
              onClick={fetchPortalData}
              className="self-start sm:self-auto flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {/* The Table Matching User's Screenshot Specification */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800/90 bg-slate-950/60 shadow-inner">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-900/80 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4 sm:px-5">Subject (বিষয়)</th>
                  <th className="py-3 px-3 text-center">মোট ক্লাস</th>
                  <th className="py-3 px-3 text-center">উপস্থিত</th>
                  <th className="py-3 px-3 text-center">অনুপস্থিত</th>
                  <th className="py-3 px-4 text-center">উপস্থিতির হার</th>
                  <th className="py-3 px-4 text-center">স্ট্যাটাস</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {subjects.map((sub, idx) => (
                  <tr
                    key={sub.code || sub.subject || idx}
                    className="hover:bg-slate-900/50 transition-colors"
                  >
                    {/* Subject Name */}
                    <td className="py-3.5 px-4 sm:px-5">
                      <div className="font-bold text-white">{sub.subject}</div>
                      {sub.code && (
                        <span className="text-[10px] text-slate-500 font-mono font-medium">
                          {sub.code} {sub.department ? `• ${sub.department}` : ""}
                        </span>
                      )}
                    </td>

                    {/* Total Classes */}
                    <td className="py-3.5 px-3 text-center font-bold text-slate-300">
                      {sub.totalClasses}
                    </td>

                    {/* Attended */}
                    <td className="py-3.5 px-3 text-center font-bold text-emerald-400">
                      {sub.present}
                    </td>

                    {/* Absent */}
                    <td className="py-3.5 px-3 text-center font-bold text-rose-400">
                      {sub.absent}
                    </td>

                    {/* Attendance Percentage with Progress Bar */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className="font-black text-white text-sm">{sub.percentage}%</span>
                        <div className="w-20 bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                          <div
                            className={`h-full rounded-full ${
                              sub.percentage >= 75
                                ? "bg-emerald-500"
                                : sub.percentage >= 65
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, sub.percentage))}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 text-center">
                      {sub.status === "Good" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          Good
                        </span>
                      ) : sub.status === "Borderline" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          Borderline
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <span className="w-2 h-2 rounded-full bg-rose-400" />
                          Low
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {/* Overall Summary Footer Row */}
                <tr className="bg-slate-900/90 font-black border-t-2 border-indigo-500/40 text-sm">
                  <td className="py-4 px-4 sm:px-5 text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <span>Overall (মোট)</span>
                  </td>
                  <td className="py-4 px-3 text-center text-white">{summary.totalClasses}</td>
                  <td className="py-4 px-3 text-center text-emerald-400">{summary.present}</td>
                  <td className="py-4 px-3 text-center text-rose-400">{summary.absent}</td>
                  <td className="py-4 px-4 text-center text-indigo-300 font-extrabold text-base">
                    {summary.percentage}%
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${
                      summary.status === "Eligible"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : summary.status === "Borderline"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${
                        summary.status === "Eligible" ? "bg-emerald-400" : summary.status === "Borderline" ? "bg-amber-400" : "bg-rose-400"
                      }`} />
                      {summary.status === "Eligible" ? "Eligible" : summary.status}
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
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Recent Class Attendance Log</h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Verification logs from Live Scan AI &amp; GPS Selfie portal.</p>
            </div>
            <Link
              href="/selfieattend"
              className="flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <span>Take Attendance</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentSessions.length === 0 ? (
            <div className="text-center py-10 bg-slate-950/40 rounded-2xl border border-slate-800/60">
              <p className="text-xs text-slate-500">No session attendance recorded yet for this cohort.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentSessions.map((session, i) => (
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
                        <span>•</span>
                        <span>{session.instructor}</span>
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
              {student.hasCustomPin && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Current PIN</label>
                  <input
                    type="password"
                    maxLength={10}
                    required
                    value={oldPin}
                    onChange={(e) => setOldPin(e.target.value)}
                    placeholder="Enter current PIN"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

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
