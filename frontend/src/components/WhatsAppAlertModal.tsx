"use client";

import { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Loader2,
  Phone,
  RefreshCw,
  Check,
  QrCode,
  Smartphone,
  LogOut,
  Radio,
  ExternalLink,
} from "lucide-react";
import { getParentPhone, formatPhoneDisplay } from "@/lib/studentContact";
import { isCohortMatching } from "@/lib/cohort";
import { SessionWhatsAppAlertMeta } from "@/lib/geofence";
import { useAuth } from "@/lib/auth";

interface WhatsAppAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  sessionName?: string;
  topicName?: string;
  initialAlertMeta?: SessionWhatsAppAlertMeta | null;
  onAlertSuccess?: (meta: SessionWhatsAppAlertMeta) => void;
}

function formatAlertDate(dateStr?: string): string {
  if (!dateStr) return "recently";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function WhatsAppAlertModal({
  isOpen,
  onClose,
  sessionId,
  sessionName = "Class Session",
  topicName = "General Lecture",
  initialAlertMeta = null,
  onAlertSuccess,
}: WhatsAppAlertModalProps) {
  const { user } = useAuth();
  const canSendAlerts = user?.role === "Super Admin" || user?.role === "Admin";
  const isSuperAdmin = user?.role === "Super Admin";

  // Session Absentees State
  const [loading, setLoading] = useState(true);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);
  const [presentCount, setPresentCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [markingStudentId, setMarkingStudentId] = useState<string | null>(null);

  // WhatsApp Alert Tracking State
  const [alertMeta, setAlertMeta] = useState<SessionWhatsAppAlertMeta | null>(initialAlertMeta);
  const [showResendConfirm, setShowResendConfirm] = useState(false);

  useEffect(() => {
    if (initialAlertMeta) {
      setAlertMeta(initialAlertMeta);
    }
  }, [initialAlertMeta]);

  // WhatsApp Web Multi-Device Connection State
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "qr_ready" | "connected"
  >("connecting");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [connectedUser, setConnectedUser] = useState<any | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Dispatch & Batch Progress State
  const [isSending, setIsSending] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{
    status: string;
    total: number;
    sent_count: number;
    failed_count: number;
    missing_phone_count: number;
    current_student?: string | null;
    details: any[];
  } | null>(null);

  // Test Message State
  const [testPhone, setTestPhone] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const statusPollRef = useRef<NodeJS.Timeout | null>(null);
  const jobPollRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch WhatsApp Connection Status & QR Code
  const fetchWhatsAppStatus = async () => {
    try {
      setIsCheckingStatus(true);
      const res = await fetch("/api/whatsapp/status");
      const data = await res.json();
      if (res.ok && data) {
        setConnectionStatus(data.status || "disconnected");
        setQrCodeDataUrl(data.qr || null);
        setConnectedUser(data.user || null);
      } else {
        setConnectionStatus("disconnected");
      }
    } catch (err) {
      console.warn("Failed to check WhatsApp status:", err);
      setConnectionStatus("disconnected");
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Poll connection status while modal is open (faster poll if waiting for QR scan)
  useEffect(() => {
    if (!isOpen || !canSendAlerts) {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
      return;
    }

    fetchWhatsAppStatus();

    const intervalMs = connectionStatus === "connected" ? 8000 : 2500;
    statusPollRef.current = setInterval(fetchWhatsAppStatus, intervalMs);

    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, [isOpen, connectionStatus]);

  // Handle Disconnect / Logout
  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect this WhatsApp number? A new QR code will be generated.")) {
      return;
    }
    setIsDisconnecting(true);
    try {
      const res = await fetch("/api/whatsapp/disconnect", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setConnectionStatus("connecting");
        setConnectedUser(null);
        setQrCodeDataUrl(null);
        setTimeout(fetchWhatsAppStatus, 1500);
      }
    } catch (err: any) {
      alert("Failed to disconnect: " + (err.message || "Network error"));
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Fetch Class Session Absentees
  const fetchSessionAbsentees = async () => {
    if (!sessionId) return;
    setLoading(true);
    setJobProgress(null);
    try {
      // 1. Fetch Session Info
      const sessRes = await fetch(`/api/sessions/${sessionId}`);
      const sessData = await sessRes.json();
      const session = sessData.session;
      const targetYear = session?.target_academic_year;

      // 2. Fetch Enrolled Students for this specific cohort & sub-batch
      const stuRes = await fetch("/api/students");
      const stuData = await stuRes.json();
      const rawStudents = stuData.students || [];
      const allStudents = rawStudents.filter((s: any) =>
        isCohortMatching(targetYear, s.academic_year)
      );

      // 3. Fetch Present Attendances
      const attRes = await fetch(`/api/attendance/session/${sessionId}`);
      const attData = await attRes.json();
      const attendances = (attData.logs || []).filter(
        (a: any) => a.status === "Present"
      );

      const presentIds = new Set(attendances.map((a: any) => a.student_id));
      const total = allStudents || [];
      const absent = total.filter((s: any) => !presentIds.has(s.id));

      setTotalCount(total.length);
      setPresentCount(presentIds.size);
      setAbsentStudents(absent);
    } catch (err) {
      console.error("Failed to load session absentee details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSessionAbsentees();
      setTestResult(null);
    }
  }, [isOpen, sessionId]);

  // 1-Click Faculty Manual Override: Mark Present
  const handleManualMarkPresent = async (studentId: string) => {
    if (!sessionId || !studentId) return;
    setMarkingStudentId(studentId);
    try {
      const res = await fetch("/api/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          student_id: studentId,
          status: "Present",
          capture_mode: "Manual Upload",
          confidence_score: 1.0,
          recorded_at: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark present");
      await fetchSessionAbsentees();
    } catch (err: any) {
      alert("Failed to mark present: " + (err.message || "Unknown error"));
    } finally {
      setMarkingStudentId(null);
    }
  };

  // Start Batch Absentee Alert Dispatch
  const handleSendAlerts = async () => {
    if (connectionStatus !== "connected") {
      alert("Please scan the WhatsApp QR code first to connect your phone.");
      return;
    }

    if (alertMeta?.sent) {
      setShowResendConfirm(true);
      return;
    }

    startBatchDispatch();
  };

  const startBatchDispatch = async () => {
    setIsSending(true);
    setJobProgress(null);

    try {
      const res = await fetch("/api/whatsapp/send-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to start WhatsApp dispatch");
      }

      if (data.jobId) {
        setActiveJobId(data.jobId);
        pollJobProgress(data.jobId);
      } else {
        setIsSending(false);
      }
    } catch (err: any) {
      setJobProgress({
        status: "failed",
        total: 0,
        sent_count: 0,
        failed_count: 1,
        missing_phone_count: 0,
        details: [{ status: "failed", error: err.message || "Failed to connect to WhatsApp service" }],
      });
      setIsSending(false);
    }
  };

  // Poll Job Progress from server
  const pollJobProgress = (jobId: string) => {
    if (jobPollRef.current) clearInterval(jobPollRef.current);

    jobPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/job-status/${jobId}`);
        const data = await res.json();

        if (res.ok && data) {
          setJobProgress(data);
          if (data.status === "completed" || data.status === "failed") {
            if (jobPollRef.current) clearInterval(jobPollRef.current);
            setIsSending(false);

            if (data.status === "completed") {
              const sentCount = data.sent_count ?? 0;
              const completedAt = data.completedAt || new Date().toISOString();
              const newMeta: SessionWhatsAppAlertMeta = {
                sent: true,
                sentCount,
                sentAt: completedAt,
              };
              setAlertMeta(newMeta);
              if (onAlertSuccess) {
                onAlertSuccess(newMeta);
              }

              // Persist status to Supabase via API
              try {
                fetch("/api/whatsapp/record-alert-status", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sessionId,
                    sessionName,
                    sentCount,
                    completedAt,
                  }),
                }).catch((e) => console.warn("Failed to record alert status:", e));
              } catch {}
            }
          }
        }
      } catch (err) {
        console.error("Job status polling error:", err);
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (jobPollRef.current) clearInterval(jobPollRef.current);
    };
  }, []);

  // Send Single Test WhatsApp Message
  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) return;
    if (connectionStatus !== "connected") {
      setTestResult("⚠️ Please scan the QR code and connect WhatsApp first.");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: testPhone.trim(),
          message: `🏫 *Jagannath Gupta Institute of Medical Sciences & Hospital*\n✅ *Test WhatsApp Notice*\n\nThis is a verified test message sent from the MedAttend Attendance Hub via linked WhatsApp account (${connectedUser?.phone || "Connected"}).`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(`✅ Test WhatsApp message delivered to ${data.recipient || testPhone}! Check your phone.`);
      } else {
        setTestResult(`❌ Error: ${data.error || "Failed to deliver message"}`);
      }
    } catch (err: any) {
      setTestResult(`❌ Error: ${err.message || "Network error"}`);
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen || !canSendAlerts) return null;

  const absenteesWithPhone = absentStudents.filter((s) => Boolean(getParentPhone(s)));
  const absenteesWithoutPhone = absentStudents.filter((s) => !getParentPhone(s));

  // Progress Calculation
  const progressPercent =
    jobProgress && jobProgress.total > 0
      ? Math.round(
          ((jobProgress.sent_count +
            jobProgress.failed_count +
            jobProgress.missing_phone_count) /
            jobProgress.total) *
            100
        )
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl sm:max-w-2xl lg:max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden whitespace-normal text-left">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white truncate">
                  WhatsApp Absentee Dispatcher
                </h2>
                {connectionStatus === "connected" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Linked</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>Scan QR</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate">
                {sessionName} • {topicName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden space-y-4 flex-1 w-full min-w-0">
          {/* Section 1: WhatsApp Device Connection Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4 sm:p-5 transition-all w-full min-w-0 overflow-hidden">
            {connectionStatus === "connected" ? (
              // Connected State
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Connected WhatsApp Account
                      </span>
                    </div>
                    <p className="text-sm font-bold text-white tracking-wide truncate">
                      {connectedUser?.phone || "Connected Device"}
                      {connectedUser?.name ? ` (${connectedUser.name})` : ""}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Messages will be sent directly to absent students' parents from this number.
                    </p>
                  </div>
                </div>

                {isSuperAdmin && (
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={isDisconnecting}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Disconnect and link a different WhatsApp number (Super Admin only)"
                    >
                      {isDisconnecting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LogOut className="w-3.5 h-3.5" />
                      )}
                      <span>Change Number</span>
                    </button>
                  </div>
                )}
              </div>
            ) : connectionStatus === "qr_ready" && (!isSuperAdmin || !qrCodeDataUrl) ? (
              // Non-SuperAdmin Restricted State (or waiting for QR)
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 w-full">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-amber-300">WhatsApp Service is not linked yet</p>
                  <p className="text-slate-400 leading-relaxed">
                    For institutional security, only a <strong>Super Administrator</strong> has permission to scan the QR code to link the official college WhatsApp account. Please contact your Super Admin to link the device.
                  </p>
                </div>
              </div>
            ) : connectionStatus === "qr_ready" && isSuperAdmin && qrCodeDataUrl ? (
              // QR Code Ready to Scan State (Super Admin Only)
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6 w-full min-w-0">
                {/* QR Code Container */}
                <div className="p-3 rounded-2xl bg-white shadow-xl flex flex-col items-center justify-center shrink-0 border border-slate-200">
                  <img
                    src={qrCodeDataUrl}
                    alt="WhatsApp QR Code"
                    className="w-36 h-36 sm:w-40 sm:h-40 rounded-xl object-contain block"
                  />
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                    <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
                    <span>Live QR Code</span>
                  </div>
                </div>

                {/* Instructions Column */}
                <div className="flex-1 min-w-0 space-y-3 w-full pr-1">
                  <div>
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                      <QrCode className="w-4 h-4 shrink-0" />
                      <span>Link Any WhatsApp Account</span>
                    </div>
                    <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                      Scan from any personal or departmental WhatsApp account:
                    </p>
                  </div>

                  {/* Step Cards */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/90 border border-slate-800/80">
                      <span className="w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">
                        1
                      </span>
                      <span className="text-slate-200 text-xs truncate">
                        Open <strong>WhatsApp</strong> on your mobile phone
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/90 border border-slate-800/80">
                      <span className="w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">
                        2
                      </span>
                      <span className="text-slate-200 text-xs truncate">
                        Go to <strong>Settings</strong> &gt; <strong>Linked Devices</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/90 border border-slate-800/80">
                      <span className="w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">
                        3
                      </span>
                      <span className="text-slate-200 text-xs truncate">
                        Tap <strong>Link a Device</strong> &amp; point camera at this QR code
                      </span>
                    </div>
                  </div>

                  {/* Action Row */}
                  <div className="pt-1 flex items-center justify-between text-xs text-slate-400">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>Waiting for scan...</span>
                    </span>
                    <button
                      type="button"
                      onClick={fetchWhatsAppStatus}
                      disabled={isCheckingStatus}
                      className="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1.5 text-xs cursor-pointer px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? "animate-spin" : ""}`} />
                      <span>Refresh QR</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // Connecting / Initializing State
              <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                <p className="text-xs text-slate-300 font-medium">
                  Connecting to WhatsApp service & generating QR code...
                </p>
                <p className="text-[11px] text-slate-500">
                  Please wait a moment while the secure bridge initializes.
                </p>
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-10 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-7 h-7 text-emerald-400 animate-spin mb-2" />
              <p className="text-xs font-medium text-slate-300">
                Analyzing session attendance & parent WhatsApp numbers...
              </p>
            </div>
          ) : (
            <>
              {/* WhatsApp Alerts Already Dispatched Banner */}
              {alertMeta?.sent && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3.5 flex items-start gap-3 w-full shadow-inner animate-in fade-in duration-300 whitespace-normal">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 shrink-0 mt-0.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 text-xs min-w-0">
                    <div className="font-bold text-emerald-300 flex items-center justify-between flex-wrap gap-1">
                      <span>WhatsApp Absentee Alerts Already Dispatched</span>
                      <span className="text-[11px] font-mono text-emerald-400/90 font-normal shrink-0">
                        {formatAlertDate(alertMeta.sentAt)}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] mt-1 leading-relaxed whitespace-normal break-words">
                      This lecture session is marked as notified ({alertMeta.sentCount} absentee notice{alertMeta.sentCount === 1 ? "" : "s"} delivered). If you need to re-notify absent students, you can dispatch again below.
                    </p>
                  </div>
                </div>
              )}

              {/* Stats Overview Banner */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full min-w-0">
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 min-w-0">
                  <div className="text-[11px] sm:text-xs text-slate-400 truncate">Total Enrolled</div>
                  <div className="text-lg sm:text-xl font-bold text-white mt-0.5">{totalCount}</div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 min-w-0">
                  <div className="text-[11px] sm:text-xs text-emerald-400 truncate">Present (Attended)</div>
                  <div className="text-lg sm:text-xl font-bold text-emerald-300 mt-0.5">{presentCount}</div>
                </div>
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/40 min-w-0">
                  <div className="text-[11px] sm:text-xs text-rose-400 truncate">Absent (To Alert)</div>
                  <div className="text-lg sm:text-xl font-bold text-rose-300 mt-0.5">{absentStudents.length}</div>
                </div>
              </div>

              {/* Message Preview Box */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/90 border border-slate-800 w-full min-w-0 overflow-hidden">
                <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                  <span>WhatsApp Notice Preview</span>
                  <span className="text-[10px] text-emerald-400 font-normal">Direct WhatsApp Message</span>
                </div>
                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs text-slate-200 leading-relaxed break-words whitespace-pre-wrap font-mono">
                  🏫 <strong className="text-emerald-300">Jagannath Gupta Institute of Medical Sciences & Hospital</strong>{"\n"}
                  ⚠️ <strong>Student Attendance Alert Notice</strong>{"\n\n"}
                  Dear Parent/Guardian,{"\n"}
                  This is to notify you that your ward <strong>[Student Name]</strong> (Roll: <strong>[Roll No]</strong>) was marked <span className="text-rose-400 font-bold">ABSENT</span> for today's class:{"\n\n"}
                  📚 <strong>Class:</strong> {sessionName}{"\n"}
                  👨‍🏫 <strong>Topic:</strong> {topicName}{"\n"}
                  📅 <strong>Date:</strong> {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}{"\n\n"}
                  <em>If you believe this is an error, please contact the department coordinator.</em>
                </div>
              </div>

              {/* Absent Students List */}
              <div className="w-full min-w-0">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                  <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Absent Students List ({absentStudents.length})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    <strong className="text-emerald-400">{absenteesWithPhone.length}</strong> with WhatsApp •{" "}
                    <strong className="text-amber-400">{absenteesWithoutPhone.length}</strong> no phone
                  </span>
                </div>

                {absentStudents.length === 0 ? (
                  <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center text-emerald-300 text-xs sm:text-sm">
                    🎉 100% Attendance! No students are absent for this class session.
                  </div>
                ) : (
                  <div className="max-h-44 overflow-y-auto overflow-x-hidden space-y-1.5 pr-1 w-full min-w-0">
                    {absentStudents.map((student) => {
                      const phone = getParentPhone(student);
                      return (
                        <div
                          key={student.id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs gap-2 min-w-0"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                              {student.student_roll}
                            </span>
                            <span className="font-medium text-slate-200 truncate">{student.full_name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {phone ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[11px]">
                                <Phone className="w-3 h-3 shrink-0" />
                                <span>{formatPhoneDisplay(phone)}</span>
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">No phone</span>
                            )}
                            <button
                              type="button"
                              disabled={markingStudentId === student.id || isSending}
                              onClick={() => handleManualMarkPresent(student.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 active:scale-95 shadow-sm"
                              title="Faculty Override: Mark Present for unscanned student"
                            >
                              {markingStudentId === student.id ? (
                                <Loader2 className="w-3 h-3 animate-spin text-emerald-300" />
                              ) : (
                                <Check className="w-3 h-3" />
                              )}
                              <span>Mark Present</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Live Batch Dispatch Progress & Results */}
              {(isSending || jobProgress) && (
                <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs space-y-3 w-full min-w-0">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-2 text-white">
                      {isSending ? (
                        <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      )}
                      <span>
                        {isSending
                          ? "Sending Absentee WhatsApp Alerts..."
                          : "WhatsApp Dispatch Completed!"}
                      </span>
                    </span>
                    <span className="text-emerald-400 font-bold">{progressPercent}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {isSending && jobProgress?.current_student && (
                    <p className="text-[11px] text-slate-400 truncate">
                      Sending notice to: <strong className="text-slate-200">{jobProgress.current_student}</strong>...
                    </p>
                  )}

                  {/* Summary Counters */}
                  {jobProgress && (
                    <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-center">
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                        <div>Sent</div>
                        <div className="text-sm font-bold">{jobProgress.sent_count}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">
                        <div>Skipped (No Phone)</div>
                        <div className="text-sm font-bold">{jobProgress.missing_phone_count}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
                        <div>Failed</div>
                        <div className="text-sm font-bold">{jobProgress.failed_count}</div>
                      </div>
                    </div>
                  )}

                  {/* Per-student delivery log */}
                  {jobProgress?.details && jobProgress.details.length > 0 && (
                    <div className="mt-2 max-h-36 overflow-y-auto space-y-1 pt-2 border-t border-slate-800">
                      {jobProgress.details.map((d: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-[11px] py-0.5 border-b border-slate-800/40 last:border-0"
                        >
                          <span className="text-slate-300 truncate">
                            {d.student_name} ({d.student_roll}) {d.phone ? `• ${d.phone}` : ""}
                          </span>
                          <span
                            className={`shrink-0 font-semibold ${
                              d.status === "sent"
                                ? "text-emerald-400"
                                : d.status === "skipped_no_phone"
                                ? "text-amber-400"
                                : "text-rose-400"
                            }`}
                          >
                            {d.status === "sent"
                              ? "✅ Sent"
                              : d.status === "skipped_no_phone"
                              ? "⚠️ No Phone"
                              : "❌ Failed"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Single Test Message Section */}
              <div className="pt-3 border-t border-slate-800/80 space-y-2.5 w-full min-w-0">
                <form
                  onSubmit={handleSendTestMessage}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full min-w-0"
                >
                  <div className="relative flex-1 min-w-0">
                    <input
                      type="text"
                      placeholder="Send quick test notice to (+91...)"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="w-full pl-3 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isTesting || !testPhone.trim() || connectionStatus !== "connected"}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                    title={connectionStatus !== "connected" ? "Connect WhatsApp first" : "Send Test WhatsApp"}
                  >
                    {isTesting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>Send Test</span>
                  </button>
                </form>
                {testResult && (
                  <p className="text-[11px] text-slate-300 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 break-words">
                    {testResult}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchSessionAbsentees}
            disabled={loading || isSending}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
            title="Refresh Absent List"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSendAlerts}
              disabled={
                isSending ||
                loading ||
                absentStudents.length === 0 ||
                connectionStatus !== "connected"
              }
              className="px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95 shrink-0"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> <span>Sending Alerts...</span>
                </>
              ) : connectionStatus !== "connected" ? (
                <>
                  <QrCode className="w-4 h-4" /> <span>Scan QR to Send ({absenteesWithPhone.length})</span>
                </>
              ) : alertMeta?.sent ? (
                <>
                  <Send className="w-4 h-4 text-emerald-300" /> <span>Resend WhatsApp Alerts ({absenteesWithPhone.length})</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> <span>Send WhatsApp Alerts ({absenteesWithPhone.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Centered Beautiful Re-send Confirmation Dialog */}
      {showResendConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 sm:p-7 max-w-sm sm:max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center relative overflow-hidden">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4 shadow-inner">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white">
              Re-send Absentee Alerts?
            </h3>

            <div className="mt-3 text-xs text-slate-300 leading-relaxed space-y-2">
              <p>
                WhatsApp absentee notices were already dispatched for this session on{" "}
                <span className="font-semibold text-emerald-400 font-mono">
                  {formatAlertDate(alertMeta?.sentAt)}
                </span>{" "}
                ({alertMeta?.sentCount} delivered).
              </p>
              <p className="text-slate-400">
                Are you sure you want to send another batch notice to the{" "}
                <strong className="text-white font-semibold">
                  {absenteesWithPhone.length} absent student{absenteesWithPhone.length === 1 ? "" : "s"}
                </strong>?
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowResendConfirm(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResendConfirm(false);
                  startBatchDispatch();
                }}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-bold transition-all shadow-lg shadow-amber-600/30 cursor-pointer flex-1 flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Yes, Re-send</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
