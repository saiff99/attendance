/* eslint-disable */
"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Camera, CheckCircle2, ShieldCheck, AlertCircle, RefreshCw, 
  UserCheck, ArrowRight, ArrowLeft, Clock, MapPin, BookOpen, 
  Sparkles, SwitchCamera, Check, X, ShieldAlert, GraduationCap,
  Building2, HelpCircle, Lock, Timer, Hourglass
} from "lucide-react";
import Webcam from "react-webcam";
import { getBackendUrl } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface ActiveSession {
  id: string;
  class_name: string;
  date: string;
  start_time: string;
  end_time: string;
  instructor_name: string;
  target_academic_year?: string;
  created_at: string;
  attendance_count?: number;
  remaining_seconds?: number;
  is_expired?: boolean;
  window_duration_seconds?: number;
}

interface StudentProfile {
  id: string;
  student_roll: string;
  full_name: string;
  academic_year: string;
  has_face_enrolled: boolean;
  is_already_present?: boolean;
  attendance_info?: {
    id: string;
    status: string;
    capture_mode: string;
    confidence_score: number;
    recorded_at: string;
  } | null;
}

function SelfieAttendContent() {
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get("session_id");

  // Step Machine: 1: select_session, 2: enter_roll, 3: capture_selfie, 4: result
  const [step, setStep] = useState<"select_session" | "enter_roll" | "capture_selfie" | "result">("select_session");
  
  // Data States
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selectedSession, setSelectedSession] = useState<ActiveSession | null>(null);
  
  // Live Clock for Real-Time 1-second Countdown Ticks
  const [nowTime, setNowTime] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [rollInput, setRollInput] = useState("");
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [lookingUpStudent, setLookingUpStudent] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Camera & Capture States
  const webcamRef = useRef<Webcam>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [submittingAttendance, setSubmittingAttendance] = useState(false);
  
  // Result States
  const [resultData, setResultData] = useState<{
    success: boolean;
    already_marked?: boolean;
    student_name?: string;
    student_roll?: string;
    academic_year?: string;
    confidence?: number;
    message?: string;
    recorded_at?: string;
  } | null>(null);

  const backendUrl = getBackendUrl();

  // Helper: calculate remaining seconds for any session (5-minute / 300s window)
  const getSessionRemainingSeconds = useCallback((sess: ActiveSession) => {
    const timeStr = sess.start_time || sess.created_at;
    if (!timeStr) return 0;
    const startMs = new Date(timeStr).getTime();
    const elapsedSec = Math.floor((nowTime - startMs) / 1000);
    const windowSec = sess.window_duration_seconds || 300;
    return Math.max(0, windowSec - elapsedSec);
  }, [nowTime]);

  // Helper: format MM:SS
  const formatTimeMMSS = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Remaining seconds for currently selected session
  const selectedRemainingSec = useMemo(() => {
    if (!selectedSession) return 0;
    return getSessionRemainingSeconds(selectedSession);
  }, [selectedSession, getSessionRemainingSeconds]);

  const isSelectedExpired = selectedSession !== null && selectedRemainingSec <= 0;

  // Fetch active sessions directly from Supabase Cloud
  const fetchActiveSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      // 1. Direct Supabase Query (works immediately on Vercel, localhost, and mobile)
      const { data: sessionData, error } = await supabase
        .from("sessions")
        .select("id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && sessionData && sessionData.length > 0) {
        const nowUtc = Date.now();
        const activeList: ActiveSession[] = sessionData.map((s: any) => {
          const timeStr = s.start_time || s.created_at;
          let remainingSeconds = 0;
          let isExpired = true;
          if (timeStr) {
            const startMs = new Date(timeStr).getTime();
            const elapsedSec = Math.floor((nowUtc - startMs) / 1000);
            remainingSeconds = Math.max(0, 300 - elapsedSec);
            isExpired = remainingSeconds <= 0;
          }
          return {
            id: s.id,
            class_name: s.class_name,
            date: s.date,
            start_time: s.start_time,
            end_time: s.end_time,
            instructor_name: s.instructor_name,
            target_academic_year: s.target_academic_year,
            created_at: s.created_at,
            remaining_seconds: remainingSeconds,
            is_expired: isExpired,
            window_duration_seconds: 300,
          };
        });

        setSessions(activeList);

        // If URL provided a session_id, auto-select it if still active
        if (initialSessionId) {
          const matched = activeList.find(s => s.id === initialSessionId);
          if (matched) {
            setSelectedSession(matched);
            setStep("enter_roll");
          }
        }
        return;
      }

      // 2. Fallback to backend API if Supabase query returned no rows or had network error
      const res = await fetch(`${backendUrl}/api/active-sessions`, {
        headers: { "ngrok-skip-browser-warning": "69420" }
      });
      if (res.ok) {
        const data = await res.json();
        const activeList: ActiveSession[] = data.sessions || [];
        setSessions(activeList);

        if (initialSessionId) {
          const matched = activeList.find(s => s.id === initialSessionId);
          if (matched) {
            setSelectedSession(matched);
            setStep("enter_roll");
          }
        }
      }
    } catch (err) {
      console.error("Failed to load active sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  }, [backendUrl, initialSessionId]);

  useEffect(() => {
    fetchActiveSessions();
  }, [fetchActiveSessions]);

  // Lookup student by roll & check live CCTV attendance
  const handleVerifyRoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rollInput.trim()) return;

    if (isSelectedExpired) {
      setLookupError("Attendance window for this lecture has expired (5-minute limit).");
      return;
    }

    setLookingUpStudent(true);
    setLookupError(null);

    const cleanRoll = rollInput.trim();

    try {
      // 1. Direct Supabase Query for fast & reliable lookup across Vercel and mobile
      let { data: studentData, error: studErr } = await supabase
        .from("students")
        .select("id, student_roll, full_name, email, academic_year, face_encoding")
        .ilike("student_roll", cleanRoll);

      if (!studentData || studentData.length === 0) {
        const resEq = await supabase
          .from("students")
          .select("id, student_roll, full_name, email, academic_year, face_encoding")
          .eq("student_roll", cleanRoll);
        studentData = resEq.data;
      }

      if (studentData && studentData.length > 0) {
        const stud = studentData[0];
        const hasFace = !!(stud.face_encoding && Array.isArray(stud.face_encoding) && stud.face_encoding.length > 0);

        let isAlreadyPresent = false;
        let attendanceInfo = null;

        if (selectedSession) {
          const { data: attData } = await supabase
            .from("attendance")
            .select("id, status, capture_mode, confidence_score, recorded_at")
            .eq("session_id", selectedSession.id)
            .eq("student_id", stud.id);

          if (attData && attData.length > 0) {
            isAlreadyPresent = true;
            attendanceInfo = attData[0];
          }
        }

        setStudent({
          id: stud.id,
          student_roll: stud.student_roll,
          full_name: stud.full_name,
          academic_year: stud.academic_year || "1st Year",
          has_face_enrolled: hasFace,
          is_already_present: isAlreadyPresent,
          attendance_info: attendanceInfo,
        });
        return;
      }

      // 2. Fallback to backend API
      const sessionIdParam = selectedSession ? `?session_id=${encodeURIComponent(selectedSession.id)}` : "";
      const res = await fetch(`${backendUrl}/api/student-lookup/${encodeURIComponent(cleanRoll)}${sessionIdParam}`, {
        headers: { "ngrok-skip-browser-warning": "69420" }
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || `No student found with Roll Number '${cleanRoll}'. Please check and try again.`);
      }

      setStudent(data.student);
    } catch (err: any) {
      setLookupError(err.message || "Failed to find student.");
      setStudent(null);
    } finally {
      setLookingUpStudent(false);
    }
  };

  // Capture frame from webcam
  const capturePhoto = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setCapturedImage(imageSrc);
      }
    }
  }, [webcamRef]);

  // Submit selfie for AI verification
  const handleSubmitSelfie = async () => {
    if (!capturedImage || !selectedSession || !student) return;

    if (isSelectedExpired) {
      setResultData({
        success: false,
        message: "The 5-minute attendance window for this lecture has just ended. Attendance could not be recorded.",
      });
      setStep("result");
      return;
    }

    setSubmittingAttendance(true);
    try {
      // Convert base64 dataURI to Blob
      const resBlob = await fetch(capturedImage);
      const blob = await resBlob.blob();

      const formData = new FormData();
      formData.append("file", blob, "selfie.jpg");
      formData.append("session_id", selectedSession.id);
      formData.append("student_roll", student.student_roll);

      const response = await fetch(`${backendUrl}/api/selfie-attendance`, {
        method: "POST",
        headers: {
          "ngrok-skip-browser-warning": "69420",
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Face verification failed.");
      }

      setResultData({
        success: true,
        already_marked: data.already_marked,
        student_name: data.student_name,
        student_roll: data.student_roll,
        academic_year: data.academic_year,
        confidence: data.confidence,
        message: data.message,
        recorded_at: data.recorded_at,
      });
      setStep("result");
    } catch (err: any) {
      setResultData({
        success: false,
        message: err.message || "Face matching failed. Please try again with proper lighting.",
      });
      setStep("result");
    } finally {
      setSubmittingAttendance(false);
    }
  };

  // Reset to initial state
  const handleReset = () => {
    setCapturedImage(null);
    setResultData(null);
    setLookupError(null);
    setSelectedSession(null);
    setStudent(null);
    setRollInput("");
    setStep("select_session");
    fetchActiveSessions();
  };

  // Count active vs expired
  const activeCount = useMemo(() => {
    return sessions.filter(s => getSessionRemainingSeconds(s) > 0).length;
  }, [sessions, getSessionRemainingSeconds]);

  return (
    <div className="min-h-screen bg-[#070B12] text-slate-100 flex flex-col items-center justify-start p-3 sm:p-6 select-none">
      {/* Background Ambient Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-64 bg-indigo-600/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-md flex items-center justify-between py-3 mb-3 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
              MedAttend <span className="text-[10px] font-semibold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded">Selfie Portal</span>
            </h1>
            <p className="text-[11px] text-slate-400">5-Min Live Face Verification</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-[11px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          AI Active
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-md flex-1 flex flex-col justify-start">

        {/* ========================================================================= */}
        {/* STEP 1: SELECT ACTIVE CLASS SESSION */}
        {/* ========================================================================= */}
        {step === "select_session" && (
          <div className="flex flex-col gap-3.5 animate-in fade-in slide-in-from-bottom-3 duration-200">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    Select Your Live Class
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Selfie check-in is valid for <strong>5 minutes</strong> from start time:
                  </p>
                </div>
                <button 
                  onClick={fetchActiveSessions} 
                  disabled={loadingSessions}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
                  title="Refresh Sessions"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingSessions ? "animate-spin text-indigo-400" : ""}`} />
                </button>
              </div>

              {loadingSessions ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                  <span className="text-xs">Finding active lecture halls...</span>
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-10 px-4 rounded-xl bg-slate-950/50 border border-slate-800/80 flex flex-col items-center text-center gap-3">
                  <AlertCircle className="w-8 h-8 text-amber-400/80" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">No Live Lectures Right Now</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      No attendance sessions are currently running today. Please wait for the professor to start the session.
                    </p>
                  </div>
                  <button
                    onClick={fetchActiveSessions}
                    className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/25 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Check Again
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 mt-2">
                  {sessions.map((sess) => {
                    const remSec = getSessionRemainingSeconds(sess);
                    const isExp = remSec <= 0;

                    return (
                      <div
                        key={sess.id}
                        onClick={() => {
                          if (!isExp) {
                            setSelectedSession(sess);
                            setStep("enter_roll");
                          }
                        }}
                        className={`group p-3.5 rounded-xl border transition-all duration-150 flex items-center justify-between ${
                          isExp
                            ? "bg-slate-950/40 border-slate-800/50 opacity-60 cursor-not-allowed"
                            : "bg-slate-950/70 hover:bg-indigo-950/30 border-slate-800 hover:border-indigo-500/50 cursor-pointer shadow-md hover:shadow-indigo-500/10"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isExp ? "bg-slate-600" : "bg-emerald-400 animate-pulse"}`} />
                            <h4 className={`text-sm font-bold truncate ${isExp ? "text-slate-400" : "text-white group-hover:text-indigo-300"}`}>
                              {sess.class_name}
                            </h4>
                          </div>
                          
                          <div className="flex items-center gap-2.5 text-xs text-slate-400 flex-wrap">
                            <span className="truncate">👨‍🏫 {sess.instructor_name || "Faculty"}</span>
                            {sess.target_academic_year && (
                              <span className="text-[11px] bg-slate-800/80 px-2 py-0.5 rounded text-indigo-300 font-medium">
                                {sess.target_academic_year}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {/* 5-Min Timer Pill */}
                          {!isExp ? (
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1 shadow-sm ${
                              remSec <= 60 
                                ? "bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse" 
                                : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            }`}>
                              <Timer className="w-3.5 h-3.5" />
                              {formatTimeMMSS(remSec)} left
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg text-[11px] font-medium text-slate-500 bg-slate-900 border border-slate-800 flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              Expired
                            </span>
                          )}

                          {!isExp && (
                            <span className="text-[10px] text-slate-500 group-hover:text-indigo-400 transition-colors flex items-center gap-0.5">
                              Check in <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Instruction Tip */}
            <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2.5">
              <Hourglass className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>5-Minute Security Rule:</strong> Selfie attendance automatically closes after 5 minutes of class start time to prevent proxy check-ins from hostel/outside.
              </span>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: ENTER ROLL NUMBER */}
        {/* ========================================================================= */}
        {step === "enter_roll" && selectedSession && (
          <div className="flex flex-col gap-3.5 animate-in fade-in slide-in-from-right-3 duration-200">
            
            {/* Live Remaining Countdown Banner */}
            <div className={`p-3 rounded-xl border flex items-center justify-between shadow-lg transition-all ${
              isSelectedExpired 
                ? "bg-red-950/50 border-red-500/50 text-red-300"
                : selectedRemainingSec <= 60
                  ? "bg-amber-950/40 border-amber-500/40 text-amber-300 animate-pulse"
                  : "bg-indigo-950/40 border-indigo-500/30 text-indigo-300"
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isSelectedExpired ? "bg-red-500" : "bg-amber-400 animate-ping"}`} />
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate">{selectedSession.class_name}</h4>
                  <p className="text-[11px] text-slate-400">
                    {isSelectedExpired ? "Check-in time has closed" : "Time remaining to submit attendance:"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <div className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs flex items-center gap-1 ${
                  isSelectedExpired 
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-slate-900 text-amber-300 border border-amber-500/30 text-sm"
                }`}>
                  <Timer className="w-3.5 h-3.5" />
                  {isSelectedExpired ? "00:00 (Closed)" : formatTimeMMSS(selectedRemainingSec)}
                </div>
                <button 
                  onClick={() => {
                    setSelectedSession(null);
                    setStudent(null);
                    setStep("select_session");
                  }}
                  className="text-[11px] text-slate-400 hover:text-white underline ml-1 cursor-pointer"
                >
                  Change
                </button>
              </div>
            </div>

            {/* If Expired Notice */}
            {isSelectedExpired ? (
              <div className="p-6 rounded-2xl bg-slate-900/90 border border-red-500/40 text-center flex flex-col items-center gap-3 shadow-xl">
                <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Attendance Window Closed</h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-xs">
                    The 5-minute self-attendance limit for <strong>{selectedSession.class_name}</strong> has expired.
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="w-full mt-2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  Return to Classes
                </button>
              </div>
            ) : (
              /* Roll Verification Form */
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
                <h2 className="text-base font-bold text-white mb-1">Enter Your Roll Number</h2>
                <p className="text-xs text-slate-400 mb-4">Please enter your college roll number to verify your profile:</p>

                <form onSubmit={handleVerifyRoll} className="flex flex-col gap-3">
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 26001"
                      value={rollInput}
                      onChange={(e) => {
                        setRollInput(e.target.value);
                        setLookupError(null);
                        setStudent(null);
                      }}
                      autoFocus
                      className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-base text-white font-mono tracking-wider placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    />
                  </div>

                  {lookupError && (
                    <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{lookupError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={lookingUpStudent || !rollInput.trim()}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {lookingUpStudent ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        <span>Checking Profile...</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-4 h-4" />
                        <span>Find My Profile</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Verified Student Profile Preview */}
                {student && (
                  <div className={`mt-4 p-4 rounded-2xl border flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150 ${
                    student.is_already_present
                      ? "bg-emerald-950/40 border-emerald-500/50 shadow-lg shadow-emerald-950/30"
                      : "bg-slate-950/80 border-slate-800"
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                          student.is_already_present
                            ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300"
                            : "bg-indigo-500/10 border border-indigo-500/30 text-indigo-300"
                        }`}>
                          {student.full_name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-white truncate">{student.full_name}</h4>
                          <p className="text-xs text-slate-400 font-mono">Roll: {student.student_roll} • {student.academic_year}</p>
                        </div>
                      </div>

                      {/* Top-Right Status Icon (Green Checkmark if already marked by CCTV, Red Cross if not) */}
                      {student.is_already_present ? (
                        <div 
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold shrink-0 animate-in zoom-in-75 duration-150 shadow-sm"
                          title="Attendance Already Recorded by CCTV Cameras"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Present</span>
                        </div>
                      ) : (
                        <div 
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/30 text-xs font-bold shrink-0 animate-in zoom-in-75 duration-150 shadow-sm"
                          title="Not Yet Detected by CCTV Cameras"
                        >
                          <X className="w-3.5 h-3.5 text-red-400" />
                          <span>Not Present Yet</span>
                        </div>
                      )}
                    </div>

                    {/* Attendance Status Context Message */}
                    {student.is_already_present ? (
                      <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-xs text-emerald-200 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Attendance Confirmed via CCTV AI!</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          Your presence was successfully recognized by the classroom CCTV cameras. You do not need to take a selfie!
                        </p>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span className="text-[11px] text-slate-300 leading-relaxed">
                          CCTV cameras haven't caught your face yet. Please click below to capture your selfie and verify attendance.
                        </span>
                      </div>
                    )}

                    {/* Action Button */}
                    {!student.has_face_enrolled ? (
                      <div className="p-2.5 rounded-lg bg-amber-950/50 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>No facial biometric enrolled. Please contact system admin.</span>
                      </div>
                    ) : student.is_already_present ? (
                      <button
                        onClick={handleReset}
                        className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer mt-1"
                      >
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Attendance Confirmed • Return Home</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setStep("capture_selfie")}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 cursor-pointer mt-1"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Proceed to Take Selfie</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: CAPTURE LIVE SELFIE */}
        {/* ========================================================================= */}
        {step === "capture_selfie" && student && selectedSession && (
          <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-right-3 duration-200">
            
            {/* Top Bar with Live Countdown & Student info */}
            <div className="flex items-center justify-between px-1">
              <button
                onClick={() => {
                  setCapturedImage(null);
                  setStep("enter_roll");
                }}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>

              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold flex items-center gap-1 ${
                  isSelectedExpired 
                    ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                    : "bg-slate-900 text-amber-300 border border-amber-500/30"
                }`}>
                  <Timer className="w-3 h-3" />
                  {isSelectedExpired ? "Expired" : formatTimeMMSS(selectedRemainingSec)}
                </span>
                <span className="text-xs font-bold text-indigo-300 truncate max-w-[120px]">{student.full_name}</span>
              </div>
            </div>

            {/* If Expired in the middle of selfie */}
            {isSelectedExpired ? (
              <div className="p-6 rounded-2xl bg-slate-900/90 border border-red-500/40 text-center flex flex-col items-center gap-3 shadow-xl my-4">
                <Lock className="w-8 h-8 text-red-400" />
                <div>
                  <h3 className="text-base font-bold text-white">5-Minute Time Limit Ended</h3>
                  <p className="text-xs text-slate-300 mt-1">
                    The check-in window closed while you were on this page.
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Return Home
                </button>
              </div>
            ) : (
              <>
                {/* Camera Viewport */}
                <div className="relative w-full aspect-[3/4] max-h-[55vh] bg-black rounded-3xl overflow-hidden border-2 border-slate-800 shadow-2xl flex items-center justify-center">
                  {!capturedImage ? (
                    <>
                      <Webcam
                        audio={false}
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        videoConstraints={{
                          facingMode: facingMode,
                          width: { ideal: 1280 },
                          height: { ideal: 720 },
                        }}
                        className="w-full h-full object-cover"
                      />

                      {/* Biometric Oval Guide Overlay */}
                      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                        <div className="w-[68%] h-[68%] border-2 border-dashed border-indigo-400/70 rounded-[50%] relative flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.15)]">
                          {/* Scanning animation bar */}
                          <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scan" />
                          
                          {/* Corner Accents */}
                          <div className="absolute top-2 w-4 h-1 bg-indigo-400 rounded-full" />
                          <div className="absolute bottom-2 w-4 h-1 bg-indigo-400 rounded-full" />
                        </div>
                        <span className="mt-3 text-[11px] font-semibold text-white/90 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                          Center your face inside the oval
                        </span>
                      </div>

                      {/* Switch Camera Button (Front/Back) */}
                      <button
                        onClick={() => setFacingMode(prev => (prev === "user" ? "environment" : "user"))}
                        className="absolute top-3 right-3 p-2.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white border border-white/20 transition-all cursor-pointer"
                        title="Switch Camera"
                      >
                        <SwitchCamera className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    /* Captured Image Preview */
                    <div className="relative w-full h-full">
                      <img 
                        src={capturedImage} 
                        alt="Captured Selfie" 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full border border-emerald-500/30 text-[11px] text-emerald-300 font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Photo Ready
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 mt-1">
                  {!capturedImage ? (
                    <button
                      onClick={capturePhoto}
                      className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base transition-all shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                    >
                      <Camera className="w-5 h-5" />
                      <span>Capture Photo</span>
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        onClick={() => setCapturedImage(null)}
                        disabled={submittingAttendance}
                        className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all border border-slate-700/80 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retake Photo
                      </button>
                      <button
                        onClick={handleSubmitSelfie}
                        disabled={submittingAttendance}
                        className="py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {submittingAttendance ? (
                          <>
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            <span>Verifying...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            <span>Submit Attendance</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  <p className="text-[11px] text-center text-slate-500">
                    AI InsightFace verifies your biometric profile against registered vectors.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: RESULT / FEEDBACK */}
        {/* ========================================================================= */}
        {step === "result" && resultData && (
          <div className="flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className={`rounded-3xl border p-6 sm:p-7 shadow-2xl flex flex-col items-center text-center ${
              resultData.success 
                ? "bg-slate-900/90 border-emerald-500/40 shadow-emerald-950/20" 
                : "bg-slate-900/90 border-red-500/40 shadow-red-950/20"
            }`}>
              
              {/* Icon / Shield */}
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 shadow-xl ${
                resultData.success 
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-emerald-500/20" 
                  : "bg-red-500/20 text-red-400 border border-red-500/40 shadow-red-500/20"
              }`}>
                {resultData.success ? (
                  <CheckCircle2 className="w-9 h-9" />
                ) : (
                  <X className="w-9 h-9" />
                )}
              </div>

              {/* Title & Message */}
              <h2 className="text-lg sm:text-xl font-bold text-white">
                {resultData.success 
                  ? (resultData.already_marked ? "Already Marked Present" : "Attendance Verified & Marked!") 
                  : "Face Verification Failed"}
              </h2>
              
              <p className="text-xs text-slate-300 mt-1.5 max-w-xs">
                {resultData.message}
              </p>

              {/* Details Card if success */}
              {resultData.success && (
                <div className="w-full mt-5 p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-left flex flex-col gap-2.5">
                  <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Student Name:</span>
                    <span className="font-bold text-white">{resultData.student_name}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Roll Number:</span>
                    <span className="font-mono font-bold text-indigo-300">{resultData.student_roll}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Lecture:</span>
                    <span className="font-medium text-slate-200 truncate max-w-[180px]">{selectedSession?.class_name}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Status:</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[11px] border border-emerald-500/30">
                      Present (Verified)
                    </span>
                  </div>
                  {resultData.confidence && (
                    <div className="flex items-center justify-between text-xs pt-0.5">
                      <span className="text-slate-400">AI Confidence:</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {(resultData.confidence * 100).toFixed(0)}% Match
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Button */}
              <div className="w-full mt-6 flex flex-col gap-2">
                {resultData.success ? (
                  <button
                    onClick={handleReset}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/25 cursor-pointer"
                  >
                    Done & Return Home
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setCapturedImage(null);
                      setStep("capture_selfie");
                    }}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/25 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try Selfie Again
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Footer Branding */}
      <footer className="w-full max-w-md text-center py-3 text-[11px] text-slate-500">
        MedAttend Smart Face Verification • AI CCTV & Mobile Hybrid
      </footer>

      {/* Animation Style */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0% { top: 15%; opacity: 0.8; }
          50% { top: 85%; opacity: 1; }
          100% { top: 15%; opacity: 0.8; }
        }
        .animate-scan {
          animation: scan 2.5s ease-in-out infinite;
        }
      `}} />
    </div>
  );
}

export default function SelfieAttendPortal() {
  return (
    <Suspense 
      fallback={
        <div className="min-h-screen bg-[#070B12] text-slate-200 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Loading Selfie Attendance Portal...</p>
        </div>
      }
    >
      <SelfieAttendContent />
    </Suspense>
  );
}

