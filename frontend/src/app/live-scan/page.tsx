/* eslint-disable */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { 
  Camera, Upload, CheckCircle2, PlayCircle, StopCircle, Activity, Loader2, 
  ArrowLeft, BookOpen, Users, MapPin, Video, Download, Focus, 
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Grid, Maximize2, Minimize2, Eye, ShieldCheck, RefreshCw, X
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
  const [isProcessing, setIsProcessing] = useState(false);
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
      }, 2500); // Poll logs every 2.5s
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
    
    // Create CSV Headers
    const headers = ["Roll Number", "Full Name", "Status", "Capture Mode", "Confidence (%)", "Recorded At"];
    
    // Map data rows
    const rows = logs.map(log => {
      const studentName = log.students?.full_name || "Unknown";
      const studentRoll = log.students?.student_roll || "N/A";
      const status = log.status || "Present";
      const captureMode = log.capture_mode || "Unknown";
      const confidence = Math.round(log.confidence_score * 100).toString();
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
    link.setAttribute("download", `attendance_report_${activeSession.class_name.replace(/\s+/g, '_')}.csv`);
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

  // Split cameras into Back Row (2nd Row) and Front Row (1st Row)
  const backRowCameras = cctvCameras.filter(c => c.row.includes("2nd") || c.name.includes("2nd") || c.index >= 3);
  const frontRowCameras = cctvCameras.filter(c => c.row.includes("1st") || c.name.includes("1st") || c.index < 3);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  if (!activeSession) {
    return (
      <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300 p-8 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl max-w-lg w-full p-8 transition-colors">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600 dark:text-indigo-400">
              <Camera className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Start Attendance Session</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Initialize a lecture session with 6-camera hall monitoring.</p>
          </div>

          <form onSubmit={handleStartSession} className="space-y-4">
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Subject / Module</label>
              <input 
                id="subject"
                required
                type="text" 
                className="mt-1 block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-white bg-white dark:bg-gray-800 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors" 
                value={setupData.subject}
                onChange={e => setSetupData({...setupData, subject: e.target.value})}
                placeholder="e.g. Anatomy & Physiology"
              />
            </div>

            <div>
              <label htmlFor="hall" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lecture / Exam Hall</label>
              <select 
                id="hall"
                className="mt-1 block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-white bg-white dark:bg-gray-800 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors"
                value={setupData.hall}
                onChange={e => setSetupData({...setupData, hall: e.target.value})}
              >
                <option value="Lecture Hall 1">Lecture Hall 1 (6 CP PLUS Cameras)</option>
                <option value="Lecture Hall 2">Lecture Hall 2</option>
                <option value="Main Exam Hall">Main Exam Hall (Full Matrix)</option>
                <option value="Auditorium">Auditorium</option>
              </select>
            </div>

            <div>
              <label htmlFor="topic" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Topic / Instructor</label>
              <input 
                id="topic"
                required
                type="text" 
                className="mt-1 block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-white bg-white dark:bg-gray-800 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors" 
                value={setupData.topic}
                onChange={e => setSetupData({...setupData, topic: e.target.value})}
                placeholder="e.g. Dr. A. Rahman - Cardiovascular System"
              />
            </div>
            
            <div>
              <label htmlFor="academic_year" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Academic Cohort</label>
              <select
                id="academic_year"
                className="mt-1 block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-white bg-white dark:bg-gray-800 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors"
                value={setupData.academic_year}
                onChange={e => setSetupData({...setupData, academic_year: e.target.value})}
              >
                <option value="All">All Years (No Restriction)</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
                <option value="Interns">Interns</option>
              </select>
            </div>
            
            <div className="pt-4">
              <button
                type="submit"
                disabled={isStartingSession}
                className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isStartingSession ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Starting Live Session...</>
                ) : (
                  <><ShieldCheck className="w-5 h-5" /> Start 6-Camera Attendance Session</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300 p-4 sm:p-6 lg:p-8 flex flex-col">
      <div className="max-w-[1600px] mx-auto w-full flex-1 flex flex-col relative">
        <input 
          type="file" 
          accept="image/*" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleProcessAttendance} 
        />

        {/* Top Header */}
        <div className="mb-6 flex-shrink-0 flex flex-wrap items-center justify-between gap-4">
          <div>
            <button onClick={() => setActiveSession(null)} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center mb-2 transition-colors">
              <ArrowLeft className="w-4 h-4 mr-1" /> End Session & Back
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-3">
              <span>{activeSession.class_name}</span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping mr-1.5" />
                6-Cam AI Live
              </span>
            </h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="flex items-center"><Users className="w-4 h-4 mr-1.5 text-gray-400 dark:text-gray-500" /> {activeSession.instructor_name}</span>
              <span className="flex items-center"><MapPin className="w-4 h-4 mr-1.5 text-gray-400 dark:text-gray-500" /> {setupData.hall}</span>
              <span className="flex items-center text-indigo-600 dark:text-indigo-400 font-medium">
                Cohort: {activeSession.target_academic_year || "All"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchLogs()}
              className="inline-flex items-center px-3.5 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 shadow-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4 mr-1.5 text-gray-500" /> Sync Attendance
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
          {/* Main Visualizer Area */}
          <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden transition-colors min-w-0">
            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-100 dark:border-gray-800 p-2 overflow-x-auto gap-2 bg-gray-50/50 dark:bg-gray-800/20">
              <button
                onClick={() => setActiveTab("grid")}
                className={`flex-1 min-w-[170px] py-2.5 px-4 text-sm font-semibold rounded-xl flex items-center justify-center transition-all ${
                  activeTab === "grid"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <Grid className="w-4 h-4 mr-2" />
                6-Cam Hall Matrix
              </button>
              <button
                onClick={() => setActiveTab("cctv")}
                className={`flex-1 min-w-[150px] py-2.5 px-4 text-sm font-semibold rounded-xl flex items-center justify-center transition-all ${
                  activeTab === "cctv"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <Video className="w-4 h-4 mr-2" />
                Single Camera
              </button>
              <button
                onClick={() => setActiveTab("ptz")}
                className={`flex-1 min-w-[140px] py-2.5 px-4 text-sm font-semibold rounded-xl flex items-center justify-center transition-all ${
                  activeTab === "ptz"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <Focus className="w-4 h-4 mr-2" />
                PTZ Control
              </button>
              <button
                onClick={() => setActiveTab("live")}
                className={`flex-1 min-w-[140px] py-2.5 px-4 text-sm font-semibold rounded-xl flex items-center justify-center transition-all ${
                  activeTab === "live"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <Camera className="w-4 h-4 mr-2" />
                Webcam Scan
              </button>
              <button
                onClick={() => setActiveTab("manual")}
                className={`flex-1 min-w-[140px] py-2.5 px-4 text-sm font-semibold rounded-xl flex items-center justify-center transition-all ${
                  activeTab === "manual"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <Upload className="w-4 h-4 mr-2" />
                Photo Upload
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-4 sm:p-6 flex flex-col min-h-0 overflow-y-auto">
              {activeTab === "grid" ? (
                /* 6-CAMERA SPLIT SCREEN MATRIX */
                <div className="flex-1 flex flex-col gap-5">
                  {/* Hall Orientation Banner */}
                  <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/50 text-xs font-semibold text-gray-600 dark:text-gray-300">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-indigo-500" />
                      CP PLUS Multi-Camera AI Vision Hub (6 Nodes Synchronized)
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 font-normal">
                      Click any feed to enlarge
                    </span>
                  </div>

                  {/* 2nd Row (Back of Hall) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" /> Back Section (2nd Row Cameras)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {backRowCameras.map((cam) => (
                        <div 
                          key={cam.id} 
                          className="group relative rounded-xl overflow-hidden bg-gray-950 border border-gray-800 shadow-md aspect-video flex flex-col cursor-pointer transition-all hover:border-indigo-500 hover:shadow-indigo-500/10"
                          onClick={() => setFocusedCamera(cam)}
                        >
                          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-semibold text-white border border-white/10">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            {cam.name}
                            <span className="text-gray-400 font-mono text-[10px]">({cam.ip})</span>
                          </div>

                          <button 
                            onClick={(e) => { e.stopPropagation(); setFocusedCamera(cam); }}
                            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-black/60 text-white/80 hover:text-white hover:bg-black/90 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Maximize Camera"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>

                          <div className="w-full h-full flex items-center justify-center bg-black">
                            <MjpegPlayer 
                              url={`${backendUrl}/api/video-feed/${activeSession.id}?camera_index=${cam.index}`}
                              className="w-full h-full object-contain"
                              fallbackText={`Connecting to ${cam.name}...`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 1st Row (Front of Hall) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" /> Front Section (1st Row Cameras)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {frontRowCameras.map((cam) => (
                        <div 
                          key={cam.id} 
                          className="group relative rounded-xl overflow-hidden bg-gray-950 border border-gray-800 shadow-md aspect-video flex flex-col cursor-pointer transition-all hover:border-indigo-500 hover:shadow-indigo-500/10"
                          onClick={() => setFocusedCamera(cam)}
                        >
                          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-semibold text-white border border-white/10">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            {cam.name}
                            <span className="text-gray-400 font-mono text-[10px]">({cam.ip})</span>
                          </div>

                          <button 
                            onClick={(e) => { e.stopPropagation(); setFocusedCamera(cam); }}
                            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-black/60 text-white/80 hover:text-white hover:bg-black/90 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Maximize Camera"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>

                          <div className="w-full h-full flex items-center justify-center bg-black">
                            <MjpegPlayer 
                              url={`${backendUrl}/api/video-feed/${activeSession.id}?camera_index=${cam.index}`}
                              className="w-full h-full object-contain"
                              fallbackText={`Connecting to ${cam.name}...`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : activeTab === "cctv" ? (
                /* SINGLE CAMERA VIEW */
                <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 rounded-xl relative overflow-hidden group min-h-[420px]">
                  {/* Camera Selection Dropdown */}
                  <div className="absolute top-4 left-4 z-20 bg-black/75 backdrop-blur-md rounded-xl shadow-lg border border-white/10 text-sm flex items-center pr-2">
                    <div className="pl-3 py-2 border-r border-white/10">
                      <Video className="w-4 h-4 text-indigo-400" />
                    </div>
                    <select
                      className="py-2 pl-2 pr-6 border-0 bg-transparent text-white font-medium focus:ring-0 cursor-pointer outline-none w-full max-w-[280px] truncate"
                      value={selectedCctvIndex}
                      onChange={(e) => setSelectedCctvIndex(Number(e.target.value))}
                    >
                      {cctvCameras.map((cam) => (
                        <option key={cam.id} value={cam.index} className="bg-gray-900 text-white">
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
                    
                    {/* Status Overlay */}
                    <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 flex items-center shadow-lg border border-white/10">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse mr-2" />
                      <span className="text-white text-xs font-semibold tracking-wider">LIVE AI TRACKING</span>
                    </div>
                  </div>
                </div>
              ) : activeTab === "ptz" ? (
                /* PTZ VIEW */
                <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 rounded-xl relative overflow-hidden group min-h-[420px]">
                  {ptzCameraCount > 1 && (
                    <div className="absolute top-4 left-4 z-20 bg-black/75 backdrop-blur-md rounded-xl shadow-lg border border-white/10 text-sm flex items-center pr-2">
                      <div className="pl-3 py-2 border-r border-white/10">
                        <Focus className="w-4 h-4 text-indigo-400" />
                      </div>
                      <select
                        className="py-2 pl-2 pr-6 border-0 bg-transparent text-white font-medium focus:ring-0 cursor-pointer outline-none w-full max-w-[200px] truncate"
                        value={selectedPtzIndex}
                        onChange={(e) => setSelectedPtzIndex(Number(e.target.value))}
                      >
                        {Array.from({ length: ptzCameraCount }).map((_, idx) => (
                          <option key={idx} value={idx} className="bg-gray-900 text-white">
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
                    
                    <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 flex items-center shadow-lg border border-white/10 z-20">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse mr-2" />
                      <span className="text-white text-xs font-semibold tracking-wider">PTZ AI TRACKING</span>
                    </div>

                    {/* PTZ Joystick */}
                    <div className="absolute bottom-6 left-6 z-20 flex flex-col items-center gap-2 bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-2xl">
                      <div className="text-white/70 text-[10px] font-bold tracking-widest mb-1 uppercase">PTZ Joystick</div>
                      
                      <div className="grid grid-cols-3 gap-1">
                        <div />
                        <button 
                          onMouseDown={() => startPtzMove('up')}
                          onMouseUp={stopPtzMove}
                          onMouseLeave={stopPtzMove}
                          onTouchStart={() => startPtzMove('up')}
                          onTouchEnd={stopPtzMove}
                          className="w-9 h-9 bg-white/10 hover:bg-white/20 active:bg-indigo-500/50 rounded-lg flex items-center justify-center text-white transition-colors"
                        >
                          <ChevronUp className="w-5 h-5" />
                        </button>
                        <div />
                        <button 
                          onMouseDown={() => startPtzMove('left')}
                          onMouseUp={stopPtzMove}
                          onMouseLeave={stopPtzMove}
                          onTouchStart={() => startPtzMove('left')}
                          onTouchEnd={stopPtzMove}
                          className="w-9 h-9 bg-white/10 hover:bg-white/20 active:bg-indigo-500/50 rounded-lg flex items-center justify-center text-white transition-colors"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={stopPtzMove}
                          className="w-9 h-9 bg-white/5 rounded-full flex items-center justify-center text-white/50"
                        >
                          <div className="w-2 h-2 rounded-full bg-white/50" />
                        </button>
                        <button 
                          onMouseDown={() => startPtzMove('right')}
                          onMouseUp={stopPtzMove}
                          onMouseLeave={stopPtzMove}
                          onTouchStart={() => startPtzMove('right')}
                          onTouchEnd={stopPtzMove}
                          className="w-9 h-9 bg-white/10 hover:bg-white/20 active:bg-indigo-500/50 rounded-lg flex items-center justify-center text-white transition-colors"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                        <div />
                        <button 
                          onMouseDown={() => startPtzMove('down')}
                          onMouseUp={stopPtzMove}
                          onMouseLeave={stopPtzMove}
                          onTouchStart={() => startPtzMove('down')}
                          onTouchEnd={stopPtzMove}
                          className="w-9 h-9 bg-white/10 hover:bg-white/20 active:bg-indigo-500/50 rounded-lg flex items-center justify-center text-white transition-colors"
                        >
                          <ChevronDown className="w-5 h-5" />
                        </button>
                        <div />
                      </div>

                      <div className="flex gap-2 mt-1 pt-2 border-t border-white/10 w-full justify-center">
                        <button 
                          onMouseDown={() => startPtzMove('zoom_out')}
                          onMouseUp={stopPtzMove}
                          onMouseLeave={stopPtzMove}
                          onTouchStart={() => startPtzMove('zoom_out')}
                          onTouchEnd={stopPtzMove}
                          className="flex-1 py-1.5 bg-white/10 hover:bg-white/20 active:bg-indigo-500/50 rounded-lg flex items-center justify-center text-white text-xs transition-colors"
                        >
                          <ZoomOut className="w-4 h-4" />
                        </button>
                        <button 
                          onMouseDown={() => startPtzMove('zoom_in')}
                          onMouseUp={stopPtzMove}
                          onMouseLeave={stopPtzMove}
                          onTouchStart={() => startPtzMove('zoom_in')}
                          onTouchEnd={stopPtzMove}
                          className="flex-1 py-1.5 bg-white/10 hover:bg-white/20 active:bg-indigo-500/50 rounded-lg flex items-center justify-center text-white text-xs transition-colors"
                        >
                          <ZoomIn className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activeTab === "live" ? (
                /* WEBCAM SCAN VIEW */
                <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 rounded-xl relative overflow-hidden group min-h-[420px]">
                  {devices.length > 0 && (
                    <div className="absolute top-4 left-4 z-20 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 text-sm flex items-center pr-2">
                      <div className="pl-3 py-2 border-r border-gray-200 dark:border-gray-700">
                        <Video className="w-4 h-4 text-gray-500" />
                      </div>
                      <select
                        className="py-2 pl-2 pr-6 border-0 bg-transparent text-gray-700 dark:text-gray-200 font-medium focus:ring-0 cursor-pointer outline-none w-full max-w-[200px] truncate"
                        value={selectedDeviceId}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                      >
                        {devices.map((device, key) => (
                          <option key={device.deviceId} value={device.deviceId} className="dark:bg-gray-900">
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
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center backdrop-blur-sm transition-all">
                          <Camera className="w-16 h-16 text-white/50 mb-4" />
                          <p className="text-white font-medium tracking-widest text-sm">CAMERA STANDBY</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* PHOTO UPLOAD */
                <div 
                  onClick={() => !isProcessing && fileInputRef.current?.click()}
                  className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[420px] ${!isProcessing ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed'}`}
                >
                  {isProcessing ? (
                    <Loader2 className="w-12 h-12 text-indigo-500 dark:text-indigo-400 mb-4 animate-spin" />
                  ) : (
                    <Upload className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-4" />
                  )}
                  <p className="text-gray-600 dark:text-gray-300 font-medium">{isProcessing ? "Processing AI Attendance..." : "Click or drag classroom photo to upload"}</p>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Supports JPG, PNG (Max 5MB)</p>
                </div>
              )}

              {/* Action Bar */}
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>AI Engine: InsightFace 512D ArcFace Active</span>
                </div>

                {activeTab === "live" ? (
                  <button
                    onClick={() => setIsScanning(!isScanning)}
                    className={`flex items-center px-6 py-2 rounded-full font-medium text-white shadow-md transition-all transform hover:scale-105 ${
                      isScanning ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"
                    }`}
                  >
                    {isScanning ? (
                      <><StopCircle className="w-4 h-4 mr-2" /> Stop Scanning</>
                    ) : (
                      <><PlayCircle className="w-4 h-4 mr-2" /> Start Scanning</>
                    )}
                  </button>
                ) : activeTab === "manual" ? (
                  <button 
                    disabled={isProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center px-6 py-2 rounded-full font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all transform hover:scale-105 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning...</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" /> Select Photo</>
                    )}
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    Continuous AI Stream Monitoring
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Side: Real-time Attendance Stream */}
          <div className="w-full lg:w-[380px] flex-shrink-0 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden transition-colors">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center text-sm">
                  <Activity className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" /> Class Recognition Feed
                </h2>
                <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                  {logs.length} Present
                </span>
              </div>
              <button
                onClick={exportToCSV}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-2.5 py-1 rounded-lg transition-colors flex items-center"
              >
                <Download className="w-3 h-3 mr-1" /> Export CSV
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[700px]">
              {logs.length === 0 ? (
                <div className="text-center py-12">
                  <Eye className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Waiting for face matches...</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Students detected across any of the 6 cameras will appear here.</p>
                </div>
              ) : (
                logs.map((log) => {
                  const studentName = log.students?.full_name?.toUpperCase() || "UNKNOWN STUDENT";
                  const studentRoll = log.students?.student_roll || "N/A";
                  const time = new Date(log.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  const confidence = Math.round((log.confidence_score || 0.95) * 100);

                  return (
                    <div
                      key={log.id}
                      className="flex items-center p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
                    >
                      <div className="flex-shrink-0 mr-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-xs uppercase border border-indigo-200 dark:border-indigo-800">
                          {log.students?.full_name?.substring(0, 2) || "??"}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{studentName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-0.5">
                          <span>Roll: {studentRoll}</span>
                          <span>•</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{confidence}% match</span>
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 block font-mono">{time}</span>
                        <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-full mt-0.5">
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

        {/* Camera Focus Modal */}
        {focusedCamera && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden max-w-5xl w-full shadow-2xl flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="text-base font-bold text-white">{focusedCamera.name}</h3>
                  <span className="text-xs font-mono text-gray-400">({focusedCamera.ip})</span>
                  <span className="text-xs bg-indigo-900/60 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-700">
                    {focusedCamera.row}
                  </span>
                </div>
                <button
                  onClick={() => setFocusedCamera(null)}
                  className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="aspect-video w-full bg-black flex items-center justify-center relative">
                <MjpegPlayer 
                  url={`${backendUrl}/api/video-feed/${activeSession.id}?camera_index=${focusedCamera.index}`}
                  className="w-full h-full object-contain"
                  fallbackText={`Connecting to ${focusedCamera.name}...`}
                />
              </div>

              <div className="p-4 bg-gray-900/80 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
                <span>RTSP Stream: Substream (Zero-Lag Mode)</span>
                <button 
                  onClick={() => setFocusedCamera(null)}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
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
