/* eslint-disable */
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  Camera, Upload, CheckCircle2, PlayCircle, StopCircle, Activity, Loader2, 
  ArrowLeft, BookOpen, Users, MapPin, Video, Download, Focus, 
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Grid, Maximize2, Minimize2, Eye, ShieldCheck, RefreshCw, X, Search,
  Clock, Sparkles, ChevronLeft as PrevIcon, ChevronRight as NextIcon
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import Webcam from "react-webcam";
import { MjpegPlayer } from "@/components/MjpegPlayer";

interface CameraMeta {
  index: number;
  id: string;
  name: string;
  row: string;
  position: string;
  ip: string;
  url?: string;
}

const DEFAULT_CAMERAS: CameraMeta[] = [
  { index: 0, id: "cam-1", name: "1st Row Left", row: "1st Row (Front)", position: "Left", ip: "172.16.7.5" },
  { index: 1, id: "cam-2", name: "1st Row Middle", row: "1st Row (Front)", position: "Middle", ip: "172.16.7.3" },
  { index: 2, id: "cam-3", name: "1st Row Right", row: "1st Row (Front)", position: "Right", ip: "172.16.7.17" },
  { index: 3, id: "cam-4", name: "2nd Row Left", row: "2nd Row (Back)", position: "Left", ip: "172.16.7.16" },
  { index: 4, id: "cam-5", name: "2nd Row Middle", row: "2nd Row (Back)", position: "Middle", ip: "172.16.7.18" },
  { index: 5, id: "cam-6", name: "2nd Row Right", row: "2nd Row (Back)", position: "Right", ip: "172.16.7.9" },
];

export default function LiveScan() {
  const [activeTab, setActiveTab] = useState<"grid" | "cctv" | "ptz" | "live" | "manual">("grid");
  const [isScanning, setIsScanning] = useState(false);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [logs, setLogs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionTime, setSessionTime] = useState("00:00:00");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Session State
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeSession, setActiveSession] = useState<any>(null);
  const [setupData, setSetupData] = useState({
    subject: "",
    hall: "Lecture Hall 1",
    topic: "",
    academic_year: "All"
  });
  const [isStartingSession, setIsStartingSession] = useState(false);

  // Multi-camera state
  const [cctvCameras, setCctvCameras] = useState<CameraMeta[]>(DEFAULT_CAMERAS);
  const [cctvCameraCount, setCctvCameraCount] = useState(6);
  const [selectedCctvIndex, setSelectedCctvIndex] = useState(0);
  const [focusedCamera, setFocusedCamera] = useState<CameraMeta | null>(null);
  const [ptzCameraCount, setPtzCameraCount] = useState(1);
  const [selectedPtzIndex, setSelectedPtzIndex] = useState(0);

  // Webcam State
  const webcamRef = useRef<Webcam>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);

  const handleDevices = useCallback(
    (mediaDevices: MediaDeviceInfo[]) => {
      setDevices(mediaDevices.filter(({ kind }) => kind === "videoinput"));
    },
    [setDevices]
  );

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(handleDevices);
  }, [handleDevices]);

  // Session Duration Timer
  useEffect(() => {
    if (!activeSession) return;
    const startTime = new Date(activeSession.start_time || Date.now()).getTime();
    const timer = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      const hours = Math.floor(diff / 3600).toString().padStart(2, '0');
      const minutes = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const seconds = (diff % 60).toString().padStart(2, '0');
      setSessionTime(`${hours}:${minutes}:${seconds}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [activeSession]);

  // Automated scanning effect (for live camera only)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isScanning && activeTab === "live" && activeSession) {
      interval = setInterval(() => {
        captureAndProcess();
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isScanning, activeTab, activeSession]);

  // Log polling for CCTV / Grid mode
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if ((activeTab === "grid" || activeTab === "cctv" || activeTab === "ptz") && activeSession) {
      fetchLogs();
      interval = setInterval(() => {
        fetchLogs();
      }, 2000); // Poll logs every 2.0s
    }
    return () => clearInterval(interval);
  }, [activeTab, activeSession]);

  useEffect(() => {
    // Fetch available CCTV cameras & metadata from backend
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    fetch(`${backendUrl}/api/cameras`)
      .then(res => res.json())
      .then(data => {
        if (data.cameras && data.cameras.length > 0) {
          setCctvCameras(data.cameras);
          setCctvCameraCount(data.cameras.length);
        } else if (data.count) {
          setCctvCameraCount(data.count);
        }
      })
      .catch(err => console.error("Failed to fetch camera count", err));
      
    // Fetch available PTZ cameras
    fetch(`${backendUrl}/api/ptz-cameras`)
      .then(res => res.json())
      .then(data => setPtzCameraCount(data.count || 1))
      .catch(err => console.error("Failed to fetch PTZ camera count", err));
  }, []);

  // PTZ Control functions
  const sendPtzCommand = (direction: string) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    fetch(`${backendUrl}/api/ptz/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction })
    }).catch(err => console.error("PTZ Command Failed", err));
  };

  const startPtzMove = (direction: string) => sendPtzCommand(direction);
  const stopPtzMove = () => sendPtzCommand('stop');

  const exportToCSV = () => {
    if (!logs || logs.length === 0) {
      alert("No attendance logs to export.");
      return;
    }
    
    const headers = ["Roll Number", "Full Name", "Status", "Capture Mode", "Confidence (%)", "Recorded At"];
    const rows = logs.map(log => {
      const studentName = log.students?.full_name || "Unknown";
      const studentRoll = log.students?.student_roll || "N/A";
      const status = log.status || "Present";
      const captureMode = log.capture_mode || "AI CCTV";
      const confidence = Math.round((log.confidence_score || 0.9) * 100).toString();
      const time = new Date(log.recorded_at).toLocaleString();
      
      return [studentRoll, studentName, status, captureMode, confidence, time]
        .map(cell => `"${cell}"`)
        .join(",");
    });
    
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Attendance_${activeSession.class_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const captureAndProcess = async () => {
    if (!webcamRef.current || !activeSession) return;
    
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    try {
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', activeSession.id);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/process-attendance`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        if (result.recognized && result.recognized.length > 0) {
          await fetchLogs();
        }
      }
    } catch (err) {
      console.error("Failed background scan process", err);
    }
  };

  useEffect(() => {
    if (activeSession) {
      fetchLogs();
    }
  }, [activeSession]);

  const fetchLogs = async () => {
    if (!activeSession) return;
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*, students(student_roll, full_name)')
        .eq('session_id', activeSession.id)
        .order('recorded_at', { ascending: false });
      
      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    }
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsStartingSession(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const className = `${setupData.subject} - ${setupData.hall}`;
      
      const newSession = {
        class_name: className,
        date: today,
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        instructor_name: setupData.topic,
        target_academic_year: setupData.academic_year
      };
      
      const { data, error } = await supabase
        .from('sessions')
        .insert([newSession])
        .select()
        .single();
        
      if (error) {
        console.error("Supabase Error:", error);
        throw error;
      }
      
      setActiveSession(data);
    } catch (error: any) {
      console.error("Failed to create session:", error);
      alert(`Failed to start session: ${error.message || JSON.stringify(error)}`);
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleProcessAttendance = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSession) return;

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', activeSession.id);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/process-attendance`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to process attendance');
      }

      const result = await response.json();
      await fetchLogs();
      alert(`Attendance recorded! Identified ${result.recognized?.length || 0} students.`);
    } catch (error: any) {
      console.error("Processing failed", error);
      alert(`Failed to process photo: ${error.message}`);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Filter logs based on search query
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter(log => {
      const name = log.students?.full_name?.toLowerCase() || "";
      const roll = log.students?.student_roll?.toString().toLowerCase() || "";
      return name.includes(q) || roll.includes(q);
    });
  }, [logs, searchQuery]);

  // Modal navigation (Next/Previous camera)
  const handleNextCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!focusedCamera) return;
    const nextIdx = (focusedCamera.index + 1) % cctvCameras.length;
    setFocusedCamera(cctvCameras[nextIdx]);
  };

  const handlePrevCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!focusedCamera) return;
    const prevIdx = (focusedCamera.index - 1 + cctvCameras.length) % cctvCameras.length;
    setFocusedCamera(cctvCameras[prevIdx]);
  };

  // Split cameras into Back Row (2nd Row) and Front Row (1st Row)
  const backRowCameras = cctvCameras.filter(c => c.row.includes("2nd") || c.name.includes("2nd") || c.index >= 3);
  const frontRowCameras = cctvCameras.filter(c => c.row.includes("1st") || c.name.includes("1st") || c.index < 3);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  if (!activeSession) {
    return (
      <div className="w-full min-h-screen bg-[#070B12] text-slate-100 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-slate-900/90 backdrop-blur-2xl border border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full p-8 relative overflow-hidden">
          {/* Subtle Ambient Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-32 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />

          <div className="text-center mb-8 relative z-10">
            <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-400 shadow-inner">
              <Camera className="w-8 h-8" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Start Attendance Session</h1>
            <p className="text-sm text-slate-400 mt-2">Initialize lecture attendance with 6-camera synchronized AI tracking.</p>
          </div>

          <form onSubmit={handleStartSession} className="space-y-4 relative z-10">
            <div>
              <label htmlFor="subject" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Subject / Department</label>
              <input 
                id="subject"
                required
                type="text" 
                className="w-full rounded-xl border border-slate-800 py-3 px-4 text-white bg-slate-950/70 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-sm" 
                value={setupData.subject}
                onChange={e => setSetupData({...setupData, subject: e.target.value})}
                placeholder="e.g. Department of Anatomy & Physiology"
              />
            </div>

            <div>
              <label htmlFor="hall" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Lecture / Examination Hall</label>
              <select 
                id="hall"
                className="w-full rounded-xl border border-slate-800 py-3 px-4 text-white bg-slate-950/70 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-sm cursor-pointer"
                value={setupData.hall}
                onChange={e => setSetupData({...setupData, hall: e.target.value})}
              >
                <option value="Lecture Hall 1" className="bg-slate-900">Lecture Hall 1 (6 CP PLUS 4K Matrix)</option>
                <option value="Lecture Hall 2" className="bg-slate-900">Lecture Hall 2</option>
                <option value="Main Exam Auditorium" className="bg-slate-900">Main Exam Auditorium</option>
                <option value="Surgical Amphitheatre" className="bg-slate-900">Surgical Amphitheatre</option>
              </select>
            </div>

            <div>
              <label htmlFor="topic" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Topic / Professor Name</label>
              <input 
                id="topic"
                required
                type="text" 
                className="w-full rounded-xl border border-slate-800 py-3 px-4 text-white bg-slate-950/70 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-sm" 
                value={setupData.topic}
                onChange={e => setSetupData({...setupData, topic: e.target.value})}
                placeholder="e.g. Prof. Dr. A. K. Rahman - Cardiovascular Pathology"
              />
            </div>
            
            <div>
              <label htmlFor="academic_year" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Target Student Cohort</label>
              <select
                id="academic_year"
                className="w-full rounded-xl border border-slate-800 py-3 px-4 text-white bg-slate-950/70 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-sm cursor-pointer"
                value={setupData.academic_year}
                onChange={e => setSetupData({...setupData, academic_year: e.target.value})}
              >
                <option value="All" className="bg-slate-900">All MBBS Batches (No Restriction)</option>
                <option value="1st Year" className="bg-slate-900">1st Year MBBS</option>
                <option value="2nd Year" className="bg-slate-900">2nd Year MBBS</option>
                <option value="3rd Year" className="bg-slate-900">3rd Year MBBS</option>
                <option value="4th Year" className="bg-slate-900">4th Year MBBS</option>
                <option value="Interns" className="bg-slate-900">Interns & Residents</option>
              </select>
            </div>
            
            <div className="pt-4">
              <button
                type="submit"
                disabled={isStartingSession}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 py-3.5 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-indigo-400 focus:outline-none disabled:opacity-50 transition-all flex items-center justify-center gap-2 transform active:scale-[0.99]"
              >
                {isStartingSession ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Initializing AI Hub...</>
                ) : (
                  <><ShieldCheck className="w-5 h-5" /> Launch 6-Camera Attendance Session</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#070B12] text-slate-100 flex flex-col p-2.5 sm:p-4 lg:p-5 overflow-x-hidden box-border">
      <div className="w-full max-w-[1720px] mx-auto flex-1 flex flex-col min-w-0">
        <input 
          type="file" 
          accept="image/*" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleProcessAttendance} 
        />

        {/* Top Header Command Bar */}
        <div className="mb-4 bg-slate-900/80 backdrop-blur-xl border border-slate-800/90 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <button 
              onClick={() => setActiveSession(null)} 
              className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700/60 flex items-center transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> End Session
            </button>
            
            <div className="h-5 w-px bg-slate-800 hidden sm:block" />

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>{activeSession.class_name}</span>
                </h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping mr-1.5" />
                  6-Cam 4K Live Hub
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-0.5">
                <span className="flex items-center"><Users className="w-3.5 h-3.5 mr-1 text-slate-500" /> {activeSession.instructor_name}</span>
                <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1 text-slate-500" /> {setupData.hall}</span>
                <span className="text-indigo-400 font-medium">Cohort: {activeSession.target_academic_year || "All"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Live Timer Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs font-mono font-medium text-slate-300">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>{sessionTime}</span>
            </div>

            <button
              onClick={() => fetchLogs()}
              className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-slate-200 hover:bg-slate-700/80 hover:text-white shadow-sm transition-all"
              title="Synchronize Attendance Records"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> Sync
            </button>

            <button
              onClick={exportToCSV}
              className="inline-flex items-center px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export Report
            </button>
          </div>
        </div>

        {/* Main Dashboard Layout (Zero Horizontal Scroll) */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 w-full">
          
          {/* Left Column: Visualizer & Camera Matrix */}
          <div className="flex-1 flex flex-col bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-800/90 overflow-hidden min-w-0">
            
            {/* Segmented Mode Selector */}
            <div className="p-2 border-b border-slate-800/80 bg-slate-950/40 flex items-center gap-1.5 overflow-x-auto">
              <button
                onClick={() => setActiveTab("grid")}
                className={`flex-1 min-w-[130px] py-2 px-3 text-xs font-semibold rounded-xl flex items-center justify-center transition-all ${
                  activeTab === "grid"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Grid className="w-3.5 h-3.5 mr-1.5" />
                6-Cam Matrix
              </button>
              <button
                onClick={() => setActiveTab("cctv")}
                className={`flex-1 min-w-[120px] py-2 px-3 text-xs font-semibold rounded-xl flex items-center justify-center transition-all ${
                  activeTab === "cctv"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Video className="w-3.5 h-3.5 mr-1.5" />
                Single Feed
              </button>
              <button
                onClick={() => setActiveTab("ptz")}
                className={`flex-1 min-w-[110px] py-2 px-3 text-xs font-semibold rounded-xl flex items-center justify-center transition-all ${
                  activeTab === "ptz"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Focus className="w-3.5 h-3.5 mr-1.5" />
                PTZ Control
              </button>
              <button
                onClick={() => setActiveTab("live")}
                className={`flex-1 min-w-[110px] py-2 px-3 text-xs font-semibold rounded-xl flex items-center justify-center transition-all ${
                  activeTab === "live"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Camera className="w-3.5 h-3.5 mr-1.5" />
                Webcam Scan
              </button>
              <button
                onClick={() => setActiveTab("manual")}
                className={`flex-1 min-w-[110px] py-2 px-3 text-xs font-semibold rounded-xl flex items-center justify-center transition-all ${
                  activeTab === "manual"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Photo Upload
              </button>
            </div>

            {/* Video Viewport Area */}
            <div className="flex-1 p-3 sm:p-4 flex flex-col min-h-0 overflow-y-auto">
              {activeTab === "grid" ? (
                /* 6-CAMERA SPLIT SCREEN MATRIX */
                <div className="flex-1 flex flex-col gap-4">
                  {/* Hall Orientation Banner */}
                  <div className="flex items-center justify-between px-3.5 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs font-medium text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      CP PLUS Vision Hub (6 Nodes Synchronized • 4K AI Stream)
                    </span>
                    <span className="text-slate-500 text-[11px] hidden sm:inline">
                      Click any feed to open fullscreen studio focus
                    </span>
                  </div>

                  {/* 2nd Row (Back of Hall) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" /> Back Section (2nd Row Cameras)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      {backRowCameras.map((cam) => (
                        <div 
                          key={cam.id} 
                          className="group relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800/90 shadow-lg aspect-video flex flex-col cursor-pointer transition-all hover:border-indigo-500/80 hover:shadow-indigo-500/10"
                          onClick={() => setFocusedCamera(cam)}
                        >
                          {/* Top-Left Camera Label Badge */}
                          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-semibold text-white border border-white/10 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {cam.name}
                            <span className="text-slate-400 font-mono text-[9px]">({cam.ip})</span>
                          </div>

                          {/* Top-Right Maximize Button */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); setFocusedCamera(cam); }}
                            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-black/70 text-white/80 hover:text-white hover:bg-black/90 opacity-0 group-hover:opacity-100 transition-all"
                            title="Maximize Camera"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>

                          <div className="w-full h-full flex items-center justify-center bg-black">
                            <MjpegPlayer 
                              url={`${backendUrl}/api/video-feed/${activeSession.id}?camera_index=${cam.index}`}
                              className="w-full h-full object-contain"
                              fallbackText={`Connecting to ${cam.name}...`}
                              paused={focusedCamera !== null}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 1st Row (Front of Hall) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50" /> Front Section (1st Row Cameras)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      {frontRowCameras.map((cam) => (
                        <div 
                          key={cam.id} 
                          className="group relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800/90 shadow-lg aspect-video flex flex-col cursor-pointer transition-all hover:border-indigo-500/80 hover:shadow-indigo-500/10"
                          onClick={() => setFocusedCamera(cam)}
                        >
                          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-semibold text-white border border-white/10 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {cam.name}
                            <span className="text-slate-400 font-mono text-[9px]">({cam.ip})</span>
                          </div>

                          <button 
                            onClick={(e) => { e.stopPropagation(); setFocusedCamera(cam); }}
                            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-black/70 text-white/80 hover:text-white hover:bg-black/90 opacity-0 group-hover:opacity-100 transition-all"
                            title="Maximize Camera"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>

                          <div className="w-full h-full flex items-center justify-center bg-black">
                            <MjpegPlayer 
                              url={`${backendUrl}/api/video-feed/${activeSession.id}?camera_index=${cam.index}`}
                              className="w-full h-full object-contain"
                              fallbackText={`Connecting to ${cam.name}...`}
                              paused={focusedCamera !== null}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : activeTab === "cctv" ? (
                /* SINGLE CAMERA VIEW */
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 rounded-2xl relative overflow-hidden group min-h-[440px] border border-slate-800">
                  <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md rounded-xl shadow-xl border border-slate-700/70 text-xs flex items-center pr-2">
                    <div className="pl-3 py-2 border-r border-slate-700/70">
                      <Video className="w-4 h-4 text-indigo-400" />
                    </div>
                    <select
                      className="py-2 pl-2 pr-6 border-0 bg-transparent text-white font-medium focus:ring-0 cursor-pointer outline-none w-full max-w-[280px] truncate"
                      value={selectedCctvIndex}
                      onChange={(e) => setSelectedCctvIndex(Number(e.target.value))}
                    >
                      {cctvCameras.map((cam) => (
                        <option key={cam.id} value={cam.index} className="bg-slate-900 text-white">
                          {cam.name} ({cam.ip})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center">
                    <MjpegPlayer 
                      key={selectedCctvIndex}
                      url={`${backendUrl}/api/video-feed/${activeSession.id}?camera_index=${selectedCctvIndex}`} 
                      className="w-full h-full object-contain"
                    />
                    
                    <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1 flex items-center shadow-lg border border-white/10">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse mr-2" />
                      <span className="text-white text-[11px] font-semibold tracking-wider">LIVE 4K AI VISION</span>
                    </div>
                  </div>
                </div>
              ) : activeTab === "ptz" ? (
                /* PTZ VIEW */
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 rounded-2xl relative overflow-hidden group min-h-[440px] border border-slate-800">
                  {ptzCameraCount > 1 && (
                    <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md rounded-xl shadow-xl border border-slate-700/70 text-xs flex items-center pr-2">
                      <div className="pl-3 py-2 border-r border-slate-700/70">
                        <Focus className="w-4 h-4 text-indigo-400" />
                      </div>
                      <select
                        className="py-2 pl-2 pr-6 border-0 bg-transparent text-white font-medium focus:ring-0 cursor-pointer outline-none w-full max-w-[200px] truncate"
                        value={selectedPtzIndex}
                        onChange={(e) => setSelectedPtzIndex(Number(e.target.value))}
                      >
                        {Array.from({ length: ptzCameraCount }).map((_, idx) => (
                          <option key={idx} value={idx} className="bg-slate-900 text-white">
                            PTZ Camera {idx + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center">
                    <MjpegPlayer 
                      key={selectedPtzIndex}
                      url={`${backendUrl}/api/ptz-video-feed/${activeSession.id}?camera_index=${selectedPtzIndex}`} 
                      className="w-full h-full object-contain"
                    />
                    
                    <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1 flex items-center shadow-lg border border-white/10 z-20">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse mr-2" />
                      <span className="text-white text-[11px] font-semibold tracking-wider">PTZ ACTIVE</span>
                    </div>

                    {/* PTZ Joystick */}
                    <div className="absolute bottom-6 left-6 z-20 flex flex-col items-center gap-2 bg-slate-950/80 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800 shadow-2xl">
                      <div className="text-slate-400 text-[9px] font-bold tracking-widest uppercase">PTZ Control</div>
                      
                      <div className="grid grid-cols-3 gap-1">
                        <div />
                        <button 
                          onMouseDown={() => startPtzMove('up')}
                          onMouseUp={stopPtzMove}
                          onMouseLeave={stopPtzMove}
                          onTouchStart={() => startPtzMove('up')}
                          onTouchEnd={stopPtzMove}
                          className="w-8 h-8 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-600 rounded-lg flex items-center justify-center text-white transition-all"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <div />
                        <button 
                          onMouseDown={() => startPtzMove('left')}
                          onMouseUp={stopPtzMove}
                          onMouseLeave={stopPtzMove}
                          onTouchStart={() => startPtzMove('left')}
                          onTouchEnd={stopPtzMove}
                          className="w-8 h-8 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-600 rounded-lg flex items-center justify-center text-white transition-all"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={stopPtzMove}
                          className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center text-slate-500"
                        >
                          <div className="w-2 h-2 rounded-full bg-slate-500" />
                        </button>
                        <button 
                          onMouseDown={() => startPtzMove('right')}
                          onMouseUp={stopPtzMove}
                          onMouseLeave={stopPtzMove}
                          onTouchStart={() => startPtzMove('right')}
                          onTouchEnd={stopPtzMove}
                          className="w-8 h-8 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-600 rounded-lg flex items-center justify-center text-white transition-all"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <div />
                        <button 
                          onMouseDown={() => startPtzMove('down')}
                          onMouseUp={stopPtzMove}
                          onMouseLeave={stopPtzMove}
                          onTouchStart={() => startPtzMove('down')}
                          onTouchEnd={stopPtzMove}
                          className="w-8 h-8 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-600 rounded-lg flex items-center justify-center text-white transition-all"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <div />
                      </div>

                      <div className="flex gap-1.5 mt-1 pt-2 border-t border-slate-800 w-full justify-center">
                        <button 
                          onMouseDown={() => startPtzMove('zoom_out')}
                          onMouseUp={stopPtzMove}
                          onMouseLeave={stopPtzMove}
                          onTouchStart={() => startPtzMove('zoom_out')}
                          onTouchEnd={stopPtzMove}
                          className="flex-1 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-600 rounded-md flex items-center justify-center text-white text-[11px] transition-all"
                        >
                          <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onMouseDown={() => startPtzMove('zoom_in')}
                          onMouseUp={stopPtzMove}
                          onMouseLeave={stopPtzMove}
                          onTouchStart={() => startPtzMove('zoom_in')}
                          onTouchEnd={stopPtzMove}
                          className="flex-1 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-600 rounded-md flex items-center justify-center text-white text-[11px] transition-all"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activeTab === "live" ? (
                /* WEBCAM SCAN VIEW */
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 rounded-2xl relative overflow-hidden group min-h-[440px] border border-slate-800">
                  {devices.length > 0 && (
                    <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md rounded-xl shadow-xl border border-slate-700/70 text-xs flex items-center pr-2">
                      <div className="pl-3 py-2 border-r border-slate-700/70">
                        <Video className="w-4 h-4 text-slate-400" />
                      </div>
                      <select
                        className="py-2 pl-2 pr-6 border-0 bg-transparent text-white font-medium focus:ring-0 cursor-pointer outline-none w-full max-w-[200px] truncate"
                        value={selectedDeviceId}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                      >
                        {devices.map((device, key) => (
                          <option key={device.deviceId} value={device.deviceId} className="bg-slate-900 text-white">
                            {device.label || `Camera ${key + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  <div className="absolute inset-0 w-full h-full">
                    <div className="w-full h-full bg-black flex items-center justify-center relative overflow-hidden">
                      <Webcam
                        audio={false}
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        videoConstraints={{ deviceId: selectedDeviceId }}
                        className="w-full h-full object-cover"
                      />
                      
                      {isScanning && (
                        <div className="absolute inset-0 border-2 border-indigo-500/30 m-8 rounded-lg pointer-events-none">
                          <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-indigo-500 -mt-1 -ml-1" />
                          <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-indigo-500 -mt-1 -mr-1" />
                          <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-indigo-500 -mb-1 -ml-1" />
                          <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-indigo-500 -mb-1 -mr-1" />
                          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-indigo-400/50 shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-scan" />
                        </div>
                      )}
                      
                      {!isScanning && (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm transition-all">
                          <Camera className="w-14 h-14 text-slate-500 mb-3" />
                          <p className="text-slate-300 font-medium tracking-widest text-xs">WEBCAM STANDBY</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* PHOTO UPLOAD */
                <div 
                  onClick={() => !isProcessing && fileInputRef.current?.click()}
                  className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-950/60 hover:bg-slate-950 hover:border-indigo-500/50 transition-all min-h-[440px] ${!isProcessing ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed'}`}
                >
                  {isProcessing ? (
                    <Loader2 className="w-12 h-12 text-indigo-400 mb-3 animate-spin" />
                  ) : (
                    <Upload className="w-12 h-12 text-slate-600 mb-3" />
                  )}
                  <p className="text-slate-300 font-medium text-sm">{isProcessing ? "Processing AI Recognition..." : "Click or drag classroom photo to upload"}</p>
                  <p className="text-slate-500 text-xs mt-1">Supports JPG, PNG (High Resolution Classroom Wide Shots)</p>
                </div>
              )}

              {/* Action Bar */}
              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>AI Engine: InsightFace 512D ArcFace Active (Zero-Lag Mode)</span>
                </div>

                {activeTab === "live" ? (
                  <button
                    onClick={() => setIsScanning(!isScanning)}
                    className={`flex items-center px-4 py-1.5 rounded-xl font-semibold text-xs text-white shadow-md transition-all ${
                      isScanning ? "bg-red-600 hover:bg-red-500" : "bg-indigo-600 hover:bg-indigo-500"
                    }`}
                  >
                    {isScanning ? (
                      <><StopCircle className="w-3.5 h-3.5 mr-1.5" /> Stop Scan</>
                    ) : (
                      <><PlayCircle className="w-3.5 h-3.5 mr-1.5" /> Start Scan</>
                    )}
                  </button>
                ) : activeTab === "manual" ? (
                  <button 
                    disabled={isProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center px-4 py-1.5 rounded-xl font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-500 shadow-md transition-all disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Scanning...</>
                    ) : (
                      <><Upload className="w-3.5 h-3.5 mr-1.5" /> Select Photo</>
                    )}
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    Continuous AI Stream Monitoring
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Attendance Feed (Responsive Width, Zero Overflow) */}
          <div className="w-full lg:w-[320px] xl:w-[360px] 2xl:w-[390px] flex-shrink-0 bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-800/90 flex flex-col overflow-hidden">
            
            {/* Header with Search */}
            <div className="p-3.5 border-b border-slate-800/80 bg-slate-950/50 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  <h2 className="font-bold text-white text-xs uppercase tracking-wider">Live Recognition</h2>
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                    {logs.length} Present
                  </span>
                </div>
              </div>

              {/* Quick Search Filter */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search student or roll..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/80 transition-all"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Student Attendance List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[calc(100vh-280px)] min-h-[300px]">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <Eye className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-semibold text-slate-400">
                    {searchQuery ? "No matching students found" : "Waiting for face matches..."}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {searchQuery ? "Try a different search keyword." : "Students detected across any of the 6 cameras will appear here instantly."}
                  </p>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const studentName = log.students?.full_name?.toUpperCase() || "UNKNOWN STUDENT";
                  const studentRoll = log.students?.student_roll || "N/A";
                  const time = new Date(log.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  const confidence = Math.round((log.confidence_score || 0.95) * 100);

                  return (
                    <div
                      key={log.id}
                      className="flex items-center p-2.5 rounded-xl border border-slate-800/80 bg-slate-950/60 hover:bg-slate-950 hover:border-indigo-500/40 transition-all group"
                    >
                      {/* Avatar Initials Pill */}
                      <div className="flex-shrink-0 mr-2.5">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-white font-bold text-[11px] uppercase shadow-md shadow-indigo-600/20">
                          {studentName.substring(0, 2)}
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-xs font-bold text-white truncate group-hover:text-indigo-300 transition-colors">
                          {studentName}
                        </p>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                          <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-slate-300 border border-slate-800">
                            #{studentRoll}
                          </span>
                          <span>•</span>
                          <span className="text-emerald-400 font-semibold">{confidence}% match</span>
                        </div>
                      </div>

                      <div className="flex-shrink-0 text-right">
                        <span className="text-[10px] text-slate-500 font-mono block">{time}</span>
                        <span className="inline-flex items-center text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md mt-0.5">
                          Present
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Studio Camera Focus Modal */}
        {focusedCamera && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-xl">
            <div className="bg-[#0A0E17] border border-slate-800 rounded-3xl overflow-hidden max-w-5xl w-full shadow-2xl flex flex-col relative animate-in fade-in zoom-in-95 duration-150">
              
              {/* Modal Top Bar */}
              <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-slate-800 bg-slate-900/90">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <h3 className="text-sm sm:text-base font-bold text-white truncate">{focusedCamera.name}</h3>
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    {focusedCamera.ip}
                  </span>
                  <span className="text-xs bg-indigo-500/10 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/20 hidden sm:inline">
                    {focusedCamera.row}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Camera Switcher Shortcuts */}
                  <button 
                    onClick={handlePrevCamera}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
                    title="Previous Camera"
                  >
                    <PrevIcon className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={handleNextCamera}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
                    title="Next Camera"
                  >
                    <NextIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setFocusedCamera(null)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700/60 transition-all ml-1"
                    title="Close Fullscreen"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Video Player */}
              <div className="aspect-video w-full bg-black flex items-center justify-center relative">
                <MjpegPlayer 
                  key={focusedCamera.id}
                  url={`${backendUrl}/api/video-feed/${activeSession.id}?camera_index=${focusedCamera.index}`}
                  className="w-full h-full object-contain"
                  fallbackText={`Connecting to ${focusedCamera.name}...`}
                  paused={false}
                />
              </div>

              {/* Modal Footer */}
              <div className="p-3 sm:p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>RTSP Stream: 4K Ultra-HD (Zero-Lag Synchronized)</span>
                </span>
                <button 
                  onClick={() => setFocusedCamera(null)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-md shadow-indigo-600/20"
                >
                  Return to 6-Camera Grid
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scanning Animation Styles */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes scan {
            0% { top: 0%; }
            50% { top: 100%; }
            100% { top: 0%; }
          }
          .animate-scan {
            animation: scan 3s linear infinite;
          }
        `}} />
      </div>
    </div>
  );
}
