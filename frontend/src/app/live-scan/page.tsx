/* eslint-disable */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, Upload, CheckCircle2, PlayCircle, StopCircle, Activity, Loader2, ArrowLeft, BookOpen, Users, MapPin, Video, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Webcam from "react-webcam";
import { MjpegPlayer } from "@/components/MjpegPlayer";

export default function LiveScan() {
  const [activeTab, setActiveTab] = useState<"live" | "manual" | "cctv">("live");
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
    hall: "Hall 1",
    topic: "",
    academic_year: "All"
  });
  const [isStartingSession, setIsStartingSession] = useState(false);

  // Multi-camera state
  const [cctvCameraCount, setCctvCameraCount] = useState(1);
  const [selectedCctvIndex, setSelectedCctvIndex] = useState(0);

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
      }, 5000); // 5 seconds frequency
    }
    return () => clearInterval(interval);
  }, [isScanning, activeTab, activeSession]);

  // Log polling for CCTV mode
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTab === "cctv" && activeSession) {
      interval = setInterval(() => {
        fetchLogs();
      }, 3000); // Poll logs every 3 seconds
    }
    return () => clearInterval(interval);
  }, [activeTab, activeSession]);

  useEffect(() => {
    // Fetch available CCTV cameras
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    fetch(`${backendUrl}/api/cameras`)
      .then(res => res.json())
      .then(data => setCctvCameraCount(data.count))
      .catch(err => console.error("Failed to fetch camera count", err));
  }, []);

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
      
      // Escape commas with quotes
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
    
    // getScreenshot returns a base64 string
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    try {
      // Convert base64 to Blob
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
        // Refresh logs if new people were recognized
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
        end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours duration
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
      formData.append('session_id', activeSession.id); // Pass session ID to backend

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      alert(`Success! Recognized ${result.recognized.length} students.\n\n${result.recognized.map((r: any) => r.name).join(', ')}`);
      await fetchLogs(); // Refresh logs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error processing attendance:', error);
      alert(error.message || 'Failed to process photo.');
    } finally {
      setIsProcessing(false);
      if (e.target) e.target.value = '';
    }
  };

  if (!activeSession) {
    return (
      <div className="w-full min-h-screen flex flex-col justify-center bg-gray-50 dark:bg-gray-950 transition-colors duration-300 p-8">
        <div className="w-full max-w-2xl mx-auto bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 transition-colors">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/30 mb-4">
              <BookOpen className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Class Setup</h1>
            <p className="mt-2 text-gray-500 dark:text-gray-400">Configure class details before taking attendance.</p>
          </div>

          <form onSubmit={handleStartSession} className="space-y-6">
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Subject / Topic</label>
              <input 
                id="subject"
                required
                type="text" 
                className="mt-1 block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-white bg-white dark:bg-gray-800 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors" 
                value={setupData.subject}
                onChange={e => setSetupData({...setupData, subject: e.target.value})}
                placeholder="e.g. Anatomy 101"
              />
            </div>

            <div>
              <label htmlFor="hall" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lecture Hall</label>
              <select
                id="hall"
                required
                className="mt-1 block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-white bg-white dark:bg-gray-800 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors"
                value={setupData.hall}
                onChange={e => setSetupData({...setupData, hall: e.target.value})}
              >
                <option value="Hall 1">Lecture Hall 1</option>
                <option value="Hall 2">Lecture Hall 2</option>
                <option value="Hall 3">Lecture Hall 3</option>
                <option value="Hall 4">Lecture Hall 4</option>
              </select>
            </div>

            <div>
              <label htmlFor="topic" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Topic Name</label>
              <input 
                id="topic"
                required
                type="text" 
                className="mt-1 block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-white bg-white dark:bg-gray-800 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors" 
                value={setupData.topic}
                onChange={e => setSetupData({...setupData, topic: e.target.value})}
                placeholder="e.g. Human Heart Anatomy"
              />
            </div>
            
            <div>
              <label htmlFor="academic_year" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Academic Year</label>
              <select
                id="academic_year"
                className="mt-1 block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-white bg-white dark:bg-gray-800 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors"
                value={setupData.academic_year}
                onChange={e => setSetupData({...setupData, academic_year: e.target.value})}
              >
                <option value="All">All Years (No Restriction)</option>
                <option value="1st Year">1st Year Only</option>
                <option value="2nd Year">2nd Year Only</option>
                <option value="3rd Year">3rd Year Only</option>
                <option value="4th Year">4th Year Only</option>
              </select>
            </div>
            
            <div className="pt-4">
              <button
                type="submit"
                disabled={isStartingSession}
                className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 transition-all"
              >
                {isStartingSession ? 'Starting Session...' : 'Start Attendance Session'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300 p-8 flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col relative">
        <input 
          type="file" 
          accept="image/*" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleProcessAttendance} 
      />

      <div className="mb-6 flex-shrink-0 flex items-center justify-between">
        <div>
          <button onClick={() => setActiveSession(null)} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1" /> End Session & Back
          </button>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Live Scan: {activeSession.class_name}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex items-center"><Users className="w-4 h-4 mr-1 text-gray-400 dark:text-gray-500" /> {activeSession.instructor_name}</span>
            <span className="flex items-center"><MapPin className="w-4 h-4 mr-1 text-gray-400 dark:text-gray-500" /> {setupData.hall}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-8 min-h-0">
        {/* Left Side: Camera Feed / Upload */}
        <div className="w-2/3 flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden transition-colors">
          {/* Tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-800 p-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab("live")}
              className={`flex-1 min-w-[150px] py-3 px-4 text-sm font-medium rounded-lg flex items-center justify-center transition-colors ${
                activeTab === "live"
                  ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              <Camera className="w-5 h-5 mr-2" />
              Live Camera Scan
            </button>
            <button
              onClick={() => setActiveTab("cctv")}
              className={`flex-1 min-w-[150px] py-3 px-4 text-sm font-medium rounded-lg flex items-center justify-center transition-colors ${
                activeTab === "cctv"
                  ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              <Video className="w-5 h-5 mr-2" />
              CCTV Tracking
            </button>
            <button
              onClick={() => setActiveTab("manual")}
              className={`flex-1 min-w-[150px] py-3 px-4 text-sm font-medium rounded-lg flex items-center justify-center transition-colors ${
                activeTab === "manual"
                  ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              <Upload className="w-5 h-5 mr-2" />
              Manual Upload
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 p-6 flex flex-col">
            {activeTab === "live" ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 rounded-xl relative overflow-hidden group">
                {/* Camera Selection Dropdown */}
                {devices.length > 0 && (
                  <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 text-sm flex items-center pr-2 transition-opacity">
                    <div className="pl-3 py-2 border-r border-gray-200">
                      <Video className="w-4 h-4 text-gray-500" />
                    </div>
                    <select
                      className="py-2 pl-2 pr-6 border-0 bg-transparent text-gray-700 font-medium focus:ring-0 cursor-pointer outline-none w-full max-w-[200px] truncate"
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                    >
                      {devices.map((device, key) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${key + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                {/* Actual Webcam Feed */}
                <div className="absolute inset-0 w-full h-full">
                  <div className="w-full h-full bg-black flex items-center justify-center relative overflow-hidden">
                    <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      videoConstraints={{ deviceId: selectedDeviceId }}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Scanning Box Effect Overlay (only shown when scanning) */}
                    {isScanning && (
                      <div className="absolute inset-0 border-2 border-indigo-500/30 m-8 rounded-lg pointer-events-none">
                        <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-indigo-500 -mt-1 -ml-1"></div>
                        <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-indigo-500 -mt-1 -mr-1"></div>
                        <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-indigo-500 -mb-1 -ml-1"></div>
                        <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-indigo-500 -mb-1 -mr-1"></div>
                        
                        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-indigo-400/50 shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-scan"></div>
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
            ) : activeTab === "cctv" ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 rounded-xl relative overflow-hidden group">
                
                {/* Network Camera Selection Dropdown */}
                {cctvCameraCount > 1 && (
                  <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 text-sm flex items-center pr-2 transition-opacity">
                    <div className="pl-3 py-2 border-r border-gray-200">
                      <Video className="w-4 h-4 text-gray-500" />
                    </div>
                    <select
                      className="py-2 pl-2 pr-6 border-0 bg-transparent text-gray-700 font-medium focus:ring-0 cursor-pointer outline-none w-full max-w-[200px] truncate"
                      value={selectedCctvIndex}
                      onChange={(e) => setSelectedCctvIndex(Number(e.target.value))}
                    >
                      {Array.from({ length: cctvCameraCount }).map((_, idx) => (
                        <option key={idx} value={idx}>
                          Network Camera {idx + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center">
                  <MjpegPlayer 
                    key={selectedCctvIndex}
                    url={`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/video-feed/${activeSession.id}?camera_index=${selectedCctvIndex}`} 
                    className="w-full h-full object-contain"
                  />
                  
                  {/* Status Overlay */}
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 flex items-center shadow-lg border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse mr-2"></div>
                    <span className="text-white text-xs font-semibold tracking-wider">LIVE AI TRACKING</span>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${!isProcessing ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed'}`}
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

            {/* Action Button */}
            <div className="mt-6 flex justify-center">
              {activeTab === "live" ? (
                <button
                  onClick={() => setIsScanning(!isScanning)}
                  className={`flex items-center px-8 py-3 rounded-full font-medium text-white shadow-md transition-all transform hover:scale-105 ${
                    isScanning ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  {isScanning ? (
                    <>
                      <StopCircle className="w-5 h-5 mr-2" /> Stop Scanning
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-5 h-5 mr-2" /> Start Scanning
                    </>
                  )}
                </button>
              ) : activeTab === "cctv" ? (
                <div className="px-6 py-3 rounded-full bg-gray-100 text-gray-600 font-medium border border-gray-200 shadow-inner">
                  Network Camera Feed Active
                </div>
              ) : (
                <button 
                  disabled={isProcessing}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center px-8 py-3 rounded-full font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Scanning...</>
                  ) : (
                    <><Upload className="w-5 h-5 mr-2" /> Select Photo</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Live Log */}
        <div className="w-1/3 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden transition-colors">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center">
                <Activity className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" /> Class Recognition Log
              </h2>
              <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2.5 py-0.5 rounded-full" title="Total Present">
                {logs.length}
              </span>
            </div>
            <button
              onClick={exportToCSV}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-3 py-1.5 rounded-full transition-colors flex items-center"
            >
              <Download className="w-3.5 h-3.5 mr-1" /> Export
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {logs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No attendance recorded yet for this session.</p>
            ) : (
              logs.map((log) => {
                const studentName = log.students?.full_name?.toUpperCase() || "UNKNOWN STUDENT";
                const studentRoll = log.students?.student_roll || "UNKNOWN";
                const displayName = `${studentRoll} - ${studentName}`;
                const time = new Date(log.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const confidence = Math.round(log.confidence_score * 100);

                return (
                  <div
                    key={log.id}
                    className="flex items-center p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900/50 transition-colors"
                  >
                    <div className="flex-shrink-0 mr-4">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-sm uppercase">
                        {log.students?.full_name?.substring(0, 2) || "??"}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{displayName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{time} • Conf: {confidence}%</p>
                    </div>
                    <div className="flex-shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-green-400" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      
      {/* CSS for scanning animation */}
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
