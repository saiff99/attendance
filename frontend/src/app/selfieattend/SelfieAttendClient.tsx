/* eslint-disable */
"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Camera, CheckCircle2, ShieldCheck, AlertCircle, RefreshCw, 
  UserCheck, ArrowRight, ArrowLeft, Clock, MapPin, BookOpen, 
  Sparkles, SwitchCamera, Check, X, ShieldAlert, GraduationCap,
  Building2, HelpCircle, Lock, Timer, Hourglass, Navigation, Loader2
} from "lucide-react";
import Webcam from "react-webcam";
import { getBackendUrl } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { 
  CampusGeofenceConfig, 
  DEFAULT_GEOFENCE_CONFIG, 
  calculateDistanceMeters, 
  formatDistance, 
  getUserCoordinates,
  decodeSessionMetadata,
  getLocalGeofence
} from "@/lib/geofence";
import { isCohortMatching } from "@/lib/cohort";

export interface ActiveSession {
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

export interface StudentProfile {
  id: string;
  student_roll: string;
  full_name: string;
  academic_year: string;
  has_face_enrolled: boolean;
  is_already_present?: boolean;
  cohort_mismatch?: boolean;
  target_academic_year?: string | null;
  attendance_info?: {
    id: string;
    status: string;
    capture_mode: string;
    confidence_score: number;
    recorded_at: string;
  } | null;
}

interface SelfieAttendClientProps {
  initialSessions?: ActiveSession[];
}

export function SelfieAttendContent({ initialSessions = [] }: SelfieAttendClientProps) {
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get("session_id");
  const hasAutoSelectedRef = useRef<boolean>(false);

  // Step Machine: 1: select_session, 2: enter_roll, 3: capture_selfie, 4: result
  const [step, setStep] = useState<"select_session" | "enter_roll" | "capture_selfie" | "result">(() => {
    if (initialSessionId && initialSessions.length > 0) {
      const found = initialSessions.find(s => s.id === initialSessionId);
      if (found && (found.remaining_seconds ?? 0) > 0 && !found.is_expired) {
        return "enter_roll";
      }
    }
    return "select_session";
  });
  
  // Data States
  const [sessions, setSessions] = useState<ActiveSession[]>(initialSessions);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(initialSessions.length === 0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedSession, setSelectedSession] = useState<ActiveSession | null>(() => {
    if (initialSessionId && initialSessions.length > 0) {
      const found = initialSessions.find(s => s.id === initialSessionId);
      if (found && (found.remaining_seconds ?? 0) > 0 && !found.is_expired) {
        return found;
      }
    }
    return null;
  });
  
  // Live Clock for Real-Time 1-second Countdown Ticks (Hydration safe)
  const [isMounted, setIsMounted] = useState(false);
  const [nowTime, setNowTime] = useState<number>(Date.now());
  
  useEffect(() => {
    setIsMounted(true);
    setNowTime(Date.now());
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
  const [cameraError, setCameraError] = useState<string | null>(null);
  
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

  // GPS Geofence States
  const [geofenceConfig, setGeofenceConfig] = useState<CampusGeofenceConfig>(() => getLocalGeofence());
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geofenceStatus, setGeofenceStatus] = useState<"idle" | "checking" | "allowed" | "blocked" | "permission_error">("idle");
  const [geofenceDistance, setGeofenceDistance] = useState<number | null>(null);
  const [geofenceErrorMessage, setGeofenceErrorMessage] = useState<string | null>(null);

  const backendUrl = getBackendUrl();

  // Load Geofence Configuration from API / localStorage
  useEffect(() => {
    const loadGeofence = async () => {
      try {
        const local = getLocalGeofence();
        if (local) setGeofenceConfig(local);
        const res = await fetch("/api/geofence");
        if (res.ok) {
          const data = await res.json();
          if (data.config) {
            setGeofenceConfig(data.config);
          }
        }
      } catch (e) {
        console.error("Failed to load geofence configuration", e);
      }
    };
    loadGeofence();
  }, []);

  // Determine effective geofence from selected lecture session (if session carried GPS metadata) or global config
  const effectiveGeofence = useMemo<CampusGeofenceConfig>(() => {
    if (selectedSession?.instructor_name) {
      const decoded = decodeSessionMetadata(selectedSession.instructor_name);
      if (decoded.geofence) {
        return decoded.geofence;
      }
    }
    return geofenceConfig;
  }, [selectedSession, geofenceConfig]);

  // When selected session changes, reset or auto-allow if geofence is disabled for this session
  useEffect(() => {
    if (!effectiveGeofence.enabled) {
      setGeofenceStatus("allowed");
      setGeofenceErrorMessage(null);
    } else {
      setGeofenceStatus("idle");
      setGeofenceDistance(null);
      setGeofenceErrorMessage(null);
    }
  }, [effectiveGeofence]);

  // Verify User GPS Location against Geofence boundary
  const verifyUserLocation = useCallback(async (): Promise<boolean> => {
    if (!effectiveGeofence.enabled) {
      setGeofenceStatus("allowed");
      setGeofenceErrorMessage(null);
      return true;
    }

    setGeofenceStatus("checking");
    setGeofenceErrorMessage(null);

    try {
      const coords = await getUserCoordinates(12000);
      setUserCoords({ latitude: coords.latitude, longitude: coords.longitude });
      
      const dist = calculateDistanceMeters(
        coords.latitude,
        coords.longitude,
        effectiveGeofence.latitude,
        effectiveGeofence.longitude
      );
      setGeofenceDistance(dist);

      if (dist <= effectiveGeofence.radiusMeters) {
        setGeofenceStatus("allowed");
        setGeofenceErrorMessage(null);
        return true;
      } else {
        setGeofenceStatus("blocked");
        setGeofenceErrorMessage(
          `Location Boundary Rejection: You are ${formatDistance(dist)} away from the classroom/campus (${effectiveGeofence.campusName}). Allowed radius is ${effectiveGeofence.radiusMeters}m. Attendance cannot be submitted from home or hostel.`
        );
        return false;
      }
    } catch (err: any) {
      setGeofenceStatus("permission_error");
      setGeofenceErrorMessage(
        err.message || "Please allow GPS location access in your browser settings to verify you are physically present in the classroom."
      );
      return false;
    }
  }, [effectiveGeofence]);

  // Helper: calculate remaining seconds for any session (5-minute / 300s window)
  const getSessionRemainingSeconds = useCallback((sess: ActiveSession) => {
    const timeStr = sess.start_time || sess.created_at;
    if (!timeStr) return 0;
    const startMs = new Date(timeStr).getTime();
    const currentMs = isMounted ? nowTime : Date.now();
    const elapsedSec = Math.floor((currentMs - startMs) / 1000);
    const windowSec = sess.window_duration_seconds || 300;
    return Math.max(0, windowSec - elapsedSec);
  }, [nowTime, isMounted]);

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

  // Helper to process session list with active countdowns
  const processSessionsList = useCallback((rawSessions: any[]) => {
    const nowUtc = Date.now();
    const activeList: ActiveSession[] = rawSessions.map((s: any) => {
      const timeStr = s.start_time || s.created_at;
      let remainingSeconds = 0;
      let isExpired = true;
      if (timeStr) {
        const startMs = new Date(timeStr).getTime();
        const elapsedSec = Math.floor((nowUtc - startMs) / 1000);
        remainingSeconds = Math.max(0, (s.window_duration_seconds || 300) - elapsedSec);
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
        attendance_count: s.attendance_count || 0,
        remaining_seconds: remainingSeconds,
        is_expired: isExpired,
        window_duration_seconds: s.window_duration_seconds || 300,
      };
    });

    setSessions(activeList);

    // Keep selectedSession synced with latest metadata in real-time (e.g. GPS shield toggles during live session)
    setSelectedSession(prev => {
      if (!prev) return null;
      const updated = activeList.find(s => s.id === prev.id);
      return updated ? { ...prev, ...updated } : prev;
    });

    // Only auto-select from URL once on the very first mount, and ONLY if the session is STILL VALID (not expired)
    if (initialSessionId && !hasAutoSelectedRef.current) {
      hasAutoSelectedRef.current = true;
      const matched = activeList.find(s => s.id === initialSessionId);
      if (matched && (matched.remaining_seconds ?? 0) > 0 && !matched.is_expired) {
        setSelectedSession(matched);
        setStep("enter_roll");
      }
    }
  }, [initialSessionId]);

  // Fetch active sessions client-side
  const fetchActiveSessions = useCallback(async (showFullLoader = false) => {
    setIsRefreshing(true);
    if (showFullLoader || sessions.length === 0) {
      setLoadingSessions(true);
    }
    const startTime = Date.now();
    try {
      // 1. Try Same-Origin Next.js API route first
      try {
        const localRes = await fetch("/api/active-sessions", {
          cache: "no-store",
          headers: { "ngrok-skip-browser-warning": "69420" }
        });
        if (localRes.ok) {
          const data = await localRes.json();
          if (data.sessions && Array.isArray(data.sessions) && data.sessions.length > 0) {
            processSessionsList(data.sessions);
            return;
          }
        }
      } catch (e) {}

      // 2. Direct Supabase Query
      const { data: sessionData, error } = await supabase
        .from("sessions")
        .select("id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && sessionData && sessionData.length > 0) {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const startOfTodayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        const todaySessions = sessionData.filter((s: any) => {
          const dateVal = s.date || '';
          const createdVal = s.created_at || '';
          return dateVal === todayStr || createdVal.startsWith(todayStr) || createdVal >= startOfTodayIso;
        });

        processSessionsList(todaySessions);
        return;
      }

      // 3. Fallback to backend API
      const res = await fetch(`${backendUrl}/api/active-sessions`, {
        headers: { "ngrok-skip-browser-warning": "69420" }
      });
      if (res.ok) {
        const data = await res.json();
        const activeList = data.sessions || [];
        processSessionsList(activeList);
      }
    } catch (err) {
      console.error("Failed to load active sessions:", err);
    } finally {
      const elapsed = Date.now() - startTime;
      const minSpinMs = 600;
      if (elapsed < minSpinMs) {
        setTimeout(() => {
          setIsRefreshing(false);
          setLoadingSessions(false);
        }, minSpinMs - elapsed);
      } else {
        setIsRefreshing(false);
        setLoadingSessions(false);
      }
    }
  }, [backendUrl, processSessionsList, sessions.length]);

  useEffect(() => {
    if (initialSessions.length === 0) {
      fetchActiveSessions(true);
    } else if (initialSessionId && !hasAutoSelectedRef.current) {
      const matched = initialSessions.find(s => s.id === initialSessionId);
      if (matched && (matched.remaining_seconds ?? 0) > 0 && !matched.is_expired) {
        hasAutoSelectedRef.current = true;
        setSelectedSession(matched);
        setStep("enter_roll");
      }
    }
  }, [fetchActiveSessions, initialSessions, initialSessionId]);

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
      // 1. Try Same-Origin Next.js API route first
      const sessionIdParam = selectedSession ? `?session_id=${encodeURIComponent(selectedSession.id)}` : "";
      try {
        const localRes = await fetch(`/api/student-lookup/${encodeURIComponent(cleanRoll)}${sessionIdParam}`, {
          cache: "no-store",
          headers: { "ngrok-skip-browser-warning": "69420" }
        });
        if (localRes.ok) {
          const data = await localRes.json();
          if (data.student) {
            setStudent(data.student);
            return;
          }
        }
      } catch (e) {}

      // 2. Direct Supabase Query
      let { data: studentData } = await supabase
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

        const studYear = stud.academic_year || "1st Year";
        const targetYear = selectedSession?.target_academic_year;
        const isMismatch = !isCohortMatching(targetYear, studYear);

        setStudent({
          id: stud.id,
          student_roll: stud.student_roll,
          full_name: stud.full_name,
          academic_year: studYear,
          has_face_enrolled: hasFace,
          is_already_present: isAlreadyPresent,
          attendance_info: attendanceInfo,
          cohort_mismatch: isMismatch,
          target_academic_year: targetYear,
        });
        return;
      }

      // 3. Fallback to backend API
      const res = await fetch(`${backendUrl}/api/student-lookup/${encodeURIComponent(cleanRoll)}${sessionIdParam}`, {
        headers: { "ngrok-skip-browser-warning": "69420" }
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || `No student found with Roll Number '${cleanRoll}'. Please check and try again.`);
      }

      setStudent(data.student);
      if (geofenceConfig.enabled && geofenceStatus === "idle") {
        verifyUserLocation();
      }
    } catch (err: any) {
      setLookupError(err.message || "Failed to find student.");
      setStudent(null);
    } finally {
      setLookingUpStudent(false);
    }
  };

  // Proceed to selfie capture with Geofence and Cohort checks
  const handleProceedToSelfie = async () => {
    if (isSelectedExpired) {
      setLookupError("Attendance window for this lecture has expired (5-minute limit).");
      return;
    }

    const targetYear = selectedSession?.target_academic_year;
    const studentYear = student?.academic_year;
    if (!isCohortMatching(targetYear, studentYear)) {
      setLookupError(`Cohort Restriction: This session is strictly for ${targetYear} students. Your profile is registered as ${studentYear}.`);
      return;
    }

    if (geofenceConfig.enabled && geofenceStatus !== "allowed") {
      const allowed = await verifyUserLocation();
      if (!allowed) {
        return;
      }
    }
    setStep("capture_selfie");
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

  // Resize and compress base64 data URL to optimized Blob (Crisp 960px @ 0.88 quality, ~60-80KB)
  const compressImage = async (dataurl: string, maxWidth = 960, maxHeight = 960, quality = 0.88): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
        }

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(fallbackDataURLtoBlob(dataurl));
          }
        }, "image/jpeg", quality);
      };
      img.onerror = () => {
        resolve(fallbackDataURLtoBlob(dataurl));
      };
      img.src = dataurl;
    });
  };

  const fallbackDataURLtoBlob = (dataurl: string): Blob => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

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

    const targetYear = selectedSession.target_academic_year;
    const studentYear = student.academic_year;
    if (!isCohortMatching(targetYear, studentYear)) {
      setResultData({
        success: false,
        message: `Cohort Restriction: This attendance session is strictly for '${targetYear}' students. Your profile is registered as '${studentYear}'.`,
      });
      setStep("result");
      return;
    }

    setSubmittingAttendance(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      // Compress the image so mobile 4G upload takes <100ms and never exceeds Vercel limits
      const blob = await compressImage(capturedImage);

      const formData = new FormData();
      formData.append("file", blob, "selfie.jpg");
      formData.append("session_id", selectedSession.id);
      formData.append("student_roll", student.student_roll);
      if (userCoords) {
        formData.append("latitude", userCoords.latitude.toString());
        formData.append("longitude", userCoords.longitude.toString());
      }
      if (geofenceDistance !== null) {
        formData.append("distance_meters", geofenceDistance.toString());
      }

      let response: Response | null = null;

      // 1. Direct Local Fast-Path: If backendUrl is active (e.g. localhost / LAN), connect direct in 1ms
      if (backendUrl) {
        response = await fetch(`${backendUrl}/api/selfie-attendance`, {
          method: "POST",
          headers: {
            "ngrok-skip-browser-warning": "69420",
          },
          body: formData,
          signal: controller.signal,
        }).catch(() => null);
      }

      // 2. Next.js Proxy Path: For Vercel Cloud or fallback
      if (!response || !response.ok) {
        const proxyRes = await fetch("/api/selfie-attendance", {
          method: "POST",
          headers: {
            "ngrok-skip-browser-warning": "69420",
          },
          body: formData,
          signal: controller.signal,
        }).catch(() => null);
        if (proxyRes) response = proxyRes;
      }

      clearTimeout(timeoutId);

      if (!response) {
        throw new Error("Backend server is unreachable. Please ensure the backend is running.");
      }

      let data: any = {};
      try {
        data = await response.json();
      } catch {
        data = { detail: `Server response code: ${response.status}` };
      }

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
      clearTimeout(timeoutId);
      console.error("Selfie verification error:", err);
      let errorMsg = err.message || "Face matching failed. Please try again with proper lighting.";
      if (err.name === "AbortError") {
        errorMsg = "Verification timed out. Please check your internet connection or backend server and try again.";
      }
      setResultData({
        success: false,
        message: errorMsg,
      });
      setStep("result");
    } finally {
      setSubmittingAttendance(false);
    }
  };

  // Reset to initial state
  const handleReset = () => {
    hasAutoSelectedRef.current = true;
    setCapturedImage(null);
    setResultData(null);
    setLookupError(null);
    setSelectedSession(null);
    setStudent(null);
    setRollInput("");
    setGeofenceStatus("idle");
    setGeofenceErrorMessage(null);
    setGeofenceDistance(null);
    setStep("select_session");
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    fetchActiveSessions();
  };

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
                  onClick={() => fetchActiveSessions()} 
                  disabled={isRefreshing || loadingSessions}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer disabled:opacity-60"
                  title="Refresh Sessions"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-indigo-400" : ""}`} />
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
                    onClick={() => fetchActiveSessions()}
                    disabled={isRefreshing || loadingSessions}
                    className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/25 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                    <span>{isRefreshing ? "Refreshing..." : "Check Again"}</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 mt-2">
                  {sessions.map((sess) => {
                    const remSec = getSessionRemainingSeconds(sess);
                    const isExp = remSec <= 0;

                    return (
                      <button
                        type="button"
                        key={sess.id}
                        onClick={() => {
                          if (!isExp) {
                            setSelectedSession(sess);
                            setStep("enter_roll");
                          }
                        }}
                        disabled={isExp}
                        className={`w-full text-left group p-3.5 rounded-xl border transition-all duration-150 flex items-center justify-between ${
                          isExp
                            ? "bg-slate-950/40 border-slate-800/50 opacity-60 cursor-not-allowed"
                            : "bg-slate-950/70 hover:bg-indigo-950/30 active:bg-indigo-900/40 border-slate-800 hover:border-indigo-500/50 cursor-pointer shadow-md hover:shadow-indigo-500/10"
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
                            <span className="truncate">👨‍🏫 {decodeSessionMetadata(sess.instructor_name).topic || "Faculty"}</span>
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
                            <span 
                              suppressHydrationWarning
                              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1 shadow-sm ${
                                remSec <= 60 
                                  ? "bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse" 
                                  : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                              }`}
                            >
                              <Timer className="w-3.5 h-3.5" />
                              <span suppressHydrationWarning>{formatTimeMMSS(remSec)} left</span>
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
                      </button>
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
                    hasAutoSelectedRef.current = true;
                    if (typeof window !== "undefined" && window.location.search) {
                      window.history.replaceState({}, '', window.location.pathname);
                    }
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
                {student && (() => {
                  const isCohortMismatch = !isCohortMatching(
                    selectedSession?.target_academic_year,
                    student.academic_year
                  );

                  return (
                    <div className={`mt-4 p-4 rounded-2xl border flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150 ${
                      isCohortMismatch
                        ? "bg-rose-950/40 border-rose-500/50 shadow-lg shadow-rose-950/30"
                        : student.is_already_present
                        ? "bg-emerald-950/40 border-emerald-500/50 shadow-lg shadow-emerald-950/30"
                        : "bg-slate-950/80 border-slate-800"
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                            isCohortMismatch
                              ? "bg-rose-500/20 border border-rose-500/50 text-rose-300"
                              : student.is_already_present
                              ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300"
                              : "bg-indigo-500/10 border border-indigo-500/30 text-indigo-300"
                          }`}>
                            {student.full_name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-white truncate">{student.full_name}</h4>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-slate-400 font-mono">Roll: {student.student_roll}</span>
                              <span className="text-slate-600">•</span>
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                isCohortMismatch 
                                  ? "bg-rose-500/20 border-rose-500/40 text-rose-300 font-bold" 
                                  : "bg-slate-800 border-slate-700 text-slate-300"
                              }`}>
                                {student.academic_year}
                              </span>
                            </div>
                          </div>
                        </div>

                        {isCohortMismatch ? (
                          <div 
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold shrink-0 animate-in zoom-in-75 duration-150 shadow-sm"
                            title="Cohort Mismatch: Not allowed for this session"
                          >
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                            <span>Wrong Cohort</span>
                          </div>
                        ) : student.is_already_present ? (
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

                      {isCohortMismatch ? (
                        <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 flex flex-col gap-2 shadow-lg shadow-rose-950/30 animate-in fade-in duration-200">
                          <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
                            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                            <span>Session Restricted: {selectedSession.target_academic_year} Only</span>
                          </div>
                          <p className="text-xs text-rose-100 font-medium leading-relaxed">
                            This attendance session is strictly restricted to <strong>{selectedSession.target_academic_year}</strong> students. Your profile is registered under <strong>{student.academic_year}</strong>, so you cannot submit attendance for this lecture.
                          </p>
                          <div className="text-[11px] text-rose-300/90 bg-rose-900/40 p-2.5 rounded-lg border border-rose-500/30 flex items-center justify-between flex-wrap gap-2">
                            <span>🎯 Allowed Cohort: <strong className="text-white">{selectedSession.target_academic_year}</strong></span>
                            <span>👤 Your Profile: <strong className="text-rose-200">{student.academic_year}</strong></span>
                          </div>
                        </div>
                      ) : student.is_already_present ? (
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

                      {/* GPS Geofence Security Verification Status */}
                      {effectiveGeofence.enabled && !isCohortMismatch && !student.is_already_present && student.has_face_enrolled && (
                        <div className={`p-3.5 rounded-xl border flex flex-col gap-2 transition-all ${
                          geofenceStatus === "allowed"
                            ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300 shadow-sm shadow-emerald-950/20"
                            : geofenceStatus === "blocked"
                            ? "bg-rose-950/60 border-rose-500/50 text-rose-300 shadow-md shadow-rose-950/30"
                            : geofenceStatus === "permission_error"
                            ? "bg-amber-950/50 border-amber-500/40 text-amber-300"
                            : "bg-slate-900/90 border-slate-800 text-slate-300"
                        }`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <MapPin className={`w-4 h-4 shrink-0 ${
                                geofenceStatus === "allowed" ? "text-emerald-400" :
                                geofenceStatus === "blocked" ? "text-rose-400" :
                                geofenceStatus === "permission_error" ? "text-amber-400" : "text-indigo-400"
                              }`} />
                              <span className="font-bold text-xs text-white">
                                {geofenceStatus === "allowed" ? "GPS Boundary: Verified Inside Campus" :
                                 geofenceStatus === "blocked" ? "GPS Boundary Check: Outside Campus" :
                                 geofenceStatus === "permission_error" ? "Location Permission Needed" :
                                 geofenceStatus === "checking" ? "Checking Classroom GPS Coordinates..." :
                                 "GPS Geofence Protection"}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={async () => {
                                await fetchActiveSessions();
                                verifyUserLocation();
                              }}
                              disabled={geofenceStatus === "checking"}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0 font-medium"
                            >
                              {geofenceStatus === "checking" ? (
                                <><Loader2 className="w-3 h-3 animate-spin" /> Checking...</>
                              ) : (
                                <><RefreshCw className="w-3 h-3" /> Re-check GPS</>
                              )}
                            </button>
                          </div>

                          {geofenceStatus === "allowed" && (
                            <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                              ✅ Physical location verified! You are inside <strong>{effectiveGeofence.campusName}</strong> ({geofenceDistance !== null ? `${formatDistance(geofenceDistance)} from center` : "within range"}).
                            </p>
                          )}

                          {geofenceStatus === "blocked" && (
                            <div className="space-y-1">
                              <p className="text-[11px] text-rose-200 leading-relaxed font-medium">
                                ⛔ {geofenceErrorMessage || `You are outside the allowed ${effectiveGeofence.radiusMeters}m classroom radius.`}
                              </p>
                              <p className="text-[10px] text-rose-300/80">
                                Proxy attendance from home or hostel is prevented by GPS geofencing.
                              </p>
                            </div>
                          )}

                          {geofenceStatus === "permission_error" && (
                            <p className="text-[11px] text-amber-200 leading-relaxed">
                              ⚠️ {geofenceErrorMessage || "Please allow location access in your mobile browser settings to verify you are in the lecture hall."}
                            </p>
                          )}

                          {geofenceStatus === "idle" && (
                            <p className="text-[11px] text-slate-400">
                              GPS check verifies you are within {effectiveGeofence.radiusMeters}m of {effectiveGeofence.campusName}.
                            </p>
                          )}
                        </div>
                      )}

                      {isCohortMismatch ? (
                        <div className="flex flex-col gap-2 mt-1">
                          <button
                            type="button"
                            disabled
                            className="w-full py-3 rounded-xl bg-slate-900 text-rose-400/80 border border-rose-500/30 font-bold text-xs cursor-not-allowed flex items-center justify-center gap-2 shadow-inner"
                          >
                            <ShieldAlert className="w-4 h-4 text-rose-400" />
                            <span>Submission Blocked • {selectedSession.target_academic_year} Only</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStudent(null);
                              setRollInput("");
                            }}
                            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Enter Different Roll Number
                          </button>
                        </div>
                      ) : !student.has_face_enrolled ? (
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
                          <span>Attendance Confirmed • Return to Classes</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleProceedToSelfie}
                          disabled={geofenceStatus === "checking" || geofenceStatus === "blocked"}
                          className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 mt-1 ${
                            geofenceStatus === "blocked"
                              ? "bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-75"
                              : geofenceStatus === "checking"
                              ? "bg-indigo-900/60 text-indigo-200 cursor-wait"
                              : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/25 cursor-pointer"
                          }`}
                        >
                          {geofenceStatus === "checking" ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Verifying Classroom GPS...</>
                          ) : geofenceStatus === "blocked" ? (
                            <><ShieldAlert className="w-4 h-4 text-rose-400" /> Blocked • Outside Classroom Boundary</>
                          ) : (
                            <><Camera className="w-4 h-4" /> Proceed to Take Selfie</>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: CAPTURE LIVE SELFIE */}
        {/* ========================================================================= */}
        {step === "capture_selfie" && student && selectedSession && (
          <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-right-3 duration-200">
            
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
                {effectiveGeofence.enabled && geofenceStatus === "allowed" && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    <span>GPS In-Range</span>
                  </span>
                )}
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
                  Return to Classes
                </button>
              </div>
            ) : (
              <>
                <div className="relative w-full aspect-[3/4] max-h-[55vh] bg-black rounded-3xl overflow-hidden border-2 border-slate-800 shadow-2xl flex items-center justify-center">
                  {!capturedImage ? (
                    <>
                      {cameraError ? (
                        <div className="p-6 text-center flex flex-col items-center gap-3 bg-slate-950/90 text-slate-200 z-10 w-full h-full justify-center">
                          <AlertCircle className="w-10 h-10 text-amber-400" />
                          <div>
                            <h4 className="text-sm font-bold text-white">Camera Access Blocked</h4>
                            <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                              iOS Safari blocks camera on HTTP local IP (<code>192.168.x.x</code>). Please open via the secure <strong>HTTPS portal</strong>:
                            </p>
                          </div>
                          <a
                            href={`https://attendance-cd0ishn9x-jims-hospital.vercel.app/selfieattend?session_id=${selectedSession?.id || ""}`}
                            className="mt-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/25 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Camera className="w-4 h-4" />
                            Open HTTPS Camera Portal
                          </a>
                        </div>
                      ) : (
                        <>
                          <Webcam
                            audio={false}
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            screenshotQuality={0.88}
                            minScreenshotWidth={640}
                            videoConstraints={{
                              facingMode: facingMode,
                              width: { ideal: 1280 },
                              height: { ideal: 720 },
                            }}
                            onUserMedia={() => setCameraError(null)}
                            onUserMediaError={(err: any) => {
                              console.error("Camera error:", err);
                              setCameraError("Camera permission blocked by browser.");
                            }}
                            className="w-full h-full object-cover"
                          />

                          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                            <div className="w-[68%] h-[68%] border-2 border-dashed border-indigo-400/70 rounded-[50%] relative flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.15)]">
                              <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scan" />
                              <div className="absolute top-2 w-4 h-1 bg-indigo-400 rounded-full" />
                              <div className="absolute bottom-2 w-4 h-1 bg-indigo-400 rounded-full" />
                            </div>
                            <span className="mt-3 text-[11px] font-semibold text-white/90 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                              Center your face inside the oval
                            </span>
                          </div>

                          <button
                            onClick={() => setFacingMode(prev => (prev === "user" ? "environment" : "user"))}
                            className="absolute top-3 right-3 p-2.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white border border-white/20 transition-all cursor-pointer"
                            title="Switch Camera"
                          >
                            <SwitchCamera className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </>
                  ) : (
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

              <h2 className="text-lg sm:text-xl font-bold text-white">
                {resultData.success 
                  ? (resultData.already_marked ? "Already Marked Present" : "Attendance Verified & Marked!") 
                  : "Face Verification Failed"}
              </h2>
              
              <p className="text-xs text-slate-300 mt-1.5 max-w-xs">
                {resultData.message}
              </p>

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

              <div className="w-full mt-6 flex flex-col gap-2">
                {resultData.success ? (
                  <button
                    onClick={handleReset}
                    className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/25 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Done • Return to Classes</span>
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
