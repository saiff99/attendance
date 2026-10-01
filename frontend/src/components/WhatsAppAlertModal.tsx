"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Send, CheckCircle2, AlertCircle, X, Loader2, Phone, ShieldCheck, Users, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getParentPhone, formatPhoneDisplay } from "@/lib/studentContact";

interface WhatsAppAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  sessionName?: string;
  topicName?: string;
}

export function WhatsAppAlertModal({
  isOpen,
  onClose,
  sessionId,
  sessionName = "Class Session",
  topicName = "General Lecture"
}: WhatsAppAlertModalProps) {
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);
  const [presentCount, setPresentCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [sendResult, setSendResult] = useState<any | null>(null);
  
  // Test Message state
  const [testPhone, setTestPhone] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const fetchSessionAbsentees = async () => {
    if (!sessionId) return;
    setLoading(true);
    setSendResult(null);
    try {
      // 1. Fetch Session Info
      const { data: session } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      const targetYear = session?.target_academic_year;

      // 2. Fetch Enrolled Students
      let studentQuery = supabase
        .from('students')
        .select('id, student_roll, full_name, email, academic_year, face_encoding');
      
      if (targetYear && targetYear !== 'All Years') {
        studentQuery = studentQuery.eq('academic_year', targetYear);
      }

      const { data: allStudents } = await studentQuery.order('student_roll', { ascending: true });

      // 3. Fetch Present Attendances
      const { data: attendances } = await supabase
        .from('attendance')
        .select('student_id, status')
        .eq('session_id', sessionId)
        .eq('status', 'Present');

      const presentIds = new Set((attendances || []).map(a => a.student_id));
      const total = allStudents || [];
      const absent = total.filter(s => !presentIds.has(s.id));

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

  const handleSendAlerts = async () => {
    setIsSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/whatsapp/send-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId })
      });

      const data = await res.json();
      setSendResult(data);
    } catch (err: any) {
      setSendResult({
        success: false,
        error: err.message || "Failed to connect to WhatsApp service"
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(`✅ Test WhatsApp message sent successfully to ${data.recipient || testPhone}!`);
      } else {
        setTestResult(`❌ Error: ${data.error || "Failed to deliver message"}`);
      }
    } catch (err: any) {
      setTestResult(`❌ Error: ${err.message || "Network error"}`);
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  const absenteesWithPhone = absentStudents.filter(s => Boolean(getParentPhone(s)));
  const absenteesWithoutPhone = absentStudents.filter(s => !getParentPhone(s));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                WhatsApp Absentee Alert Dispatcher
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Cloud API
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {sessionName} • {topicName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
              <p className="text-sm font-medium text-slate-300">Analyzing session attendance & parent numbers...</p>
            </div>
          ) : (
            <>
              {/* Stats Overview Banner */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                  <div className="text-xs text-slate-400">Total Enrolled</div>
                  <div className="text-xl font-bold text-white mt-0.5">{totalCount}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40">
                  <div className="text-xs text-emerald-400">Present (Attended)</div>
                  <div className="text-xl font-bold text-emerald-300 mt-0.5">{presentCount}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-800/40">
                  <div className="text-xs text-rose-400">Absent (To Alert)</div>
                  <div className="text-xl font-bold text-rose-300 mt-0.5">{absentStudents.length}</div>
                </div>
              </div>

              {/* Message Preview Box */}
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                  <span>WhatsApp Notice Preview</span>
                  <span className="text-[10px] text-emerald-400 font-normal">Official Meta Template</span>
                </div>
                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs text-slate-200 leading-relaxed font-mono">
                  🏛️ <strong className="text-emerald-300">MedAttend Medical College Hub</strong><br />
                  ⚠️ <strong>Student Attendance Alert Notice</strong><br /><br />
                  Dear Parent/Guardian,<br />
                  This is to notify you that your ward <strong>[Student Name]</strong> (Roll: <strong>[Roll No]</strong>) was marked <span className="text-rose-400 font-bold">ABSENT</span> for today's class:<br /><br />
                  📚 <strong>Class:</strong> {sessionName}<br />
                  👨‍🏫 <strong>Topic:</strong> {topicName}<br />
                  📅 <strong>Date:</strong> {new Date().toLocaleDateString([], { dateStyle: 'medium' })}
                </div>
              </div>

              {/* Absent Students List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Absent Students List ({absentStudents.length})
                  </span>
                  <span className="text-xs text-slate-400">
                    <strong className="text-emerald-400">{absenteesWithPhone.length}</strong> with WhatsApp • <strong className="text-amber-400">{absenteesWithoutPhone.length}</strong> without phone
                  </span>
                </div>

                {absentStudents.length === 0 ? (
                  <div className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center text-emerald-300 text-sm">
                    🎉 100% Attendance! No students are absent for this class session.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {absentStudents.map((student) => {
                      const phone = getParentPhone(student);
                      return (
                        <div
                          key={student.id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded text-[11px]">
                              {student.student_roll}
                            </span>
                            <span className="font-medium text-slate-200">{student.full_name}</span>
                          </div>
                          <div>
                            {phone ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[11px]">
                                <Phone className="w-3 h-3" />
                                {formatPhoneDisplay(phone)}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">No phone registered</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Send Results Banner */}
              {sendResult && (
                <div
                  className={`p-4 rounded-xl border text-xs space-y-2.5 ${
                    sendResult.success && sendResult.failed_count === 0
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                      : sendResult.success && sendResult.sent_count > 0
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-200"
                  }`}
                >
                  <div className="font-bold flex items-center gap-2">
                    {sendResult.success && sendResult.failed_count === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                    )}
                    {sendResult.success && sendResult.failed_count === 0
                      ? "All WhatsApp Alerts Dispatched Successfully!"
                      : sendResult.success
                      ? "WhatsApp Dispatch Complete (Partial/Errors)"
                      : "Dispatch Failed"}
                  </div>

                  {sendResult.success ? (
                    <div className="space-y-1.5 text-[11px] text-slate-300">
                      <div>✅ Successfully sent: <strong className="text-emerald-300">{sendResult.sent_count}</strong> parent WhatsApp alerts</div>
                      {sendResult.missing_phone_count > 0 && (
                        <div>⚠️ Skipped (no parent phone): <strong className="text-slate-400">{sendResult.missing_phone_count}</strong> students</div>
                      )}
                      {sendResult.failed_count > 0 && (
                        <div className="text-rose-300">❌ Failed to deliver: <strong>{sendResult.failed_count}</strong> alerts</div>
                      )}

                      {/* Per-student dispatch details */}
                      {Array.isArray(sendResult.details) && sendResult.details.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-800/60 space-y-1">
                          {sendResult.details.map((d: any, idx: number) => (
                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] py-1 border-b border-slate-800/40 last:border-0">
                              <span className="text-slate-300 font-medium">
                                {d.student_name} ({d.student_roll}) {d.phone ? `• ${d.phone}` : ''}
                              </span>
                              <span className={d.status === 'sent' ? 'text-emerald-400' : d.status === 'skipped_no_phone' ? 'text-amber-400' : 'text-rose-400 font-semibold'}>
                                {d.status === 'sent' ? '✅ Sent' : d.status === 'skipped_no_phone' ? '⚠️ No Phone' : `❌ ${d.error || 'Failed'}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Sandbox Restriction Guidance Box */}
                      {sendResult.failed_count > 0 && JSON.stringify(sendResult.details || '').includes('Sandbox Restriction') && (
                        <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] space-y-1">
                          <div className="font-bold flex items-center gap-1.5 text-amber-300">
                            <span>🛡️ Meta Developer Test Sandbox Requirement:</span>
                          </div>
                          <p className="text-slate-300 leading-relaxed">
                            মেটা টেস্ট অ্যাকাউন্টে (Sandbox) মেসেজ পেতে হলে প্রাপকের মোবাইল নম্বরটি Meta Developer পোর্টালে যুক্ত (Whitelist) থাকতে হবে:
                          </p>
                          <ol className="list-decimal list-inside space-y-0.5 text-slate-300 pl-1 pt-1">
                            <li><strong>Meta Developer Portal</strong> &gt; <strong>WhatsApp</strong> &gt; <strong>API Setup</strong> এ যান।</li>
                            <li><strong>Step 1 (Send and receive messages)</strong> এর নিচে <strong>"To"</strong> ড্রপডাউনের পাশে <strong>"Manage phone number list"</strong> এ ক্লিক করুন।</li>
                            <li>আপনার ফোন নম্বর (+91...) যুক্ত করে হোয়াটসঅ্যাপে আসা OTP দিয়ে ভেরিফাই করুন।</li>
                          </ol>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-rose-300">{sendResult.error || "Failed to send alerts"}</div>
                  )}
                </div>
              )}

              {/* Test Phone Box & Sandbox Tip */}
              <div className="pt-3 border-t border-slate-800/80 space-y-2">
                <form onSubmit={handleSendTestMessage} className="flex flex-col sm:flex-row items-center gap-2">
                  <div className="relative flex-1 w-full">
                    <input
                      type="text"
                      placeholder="Send instant test WhatsApp to (+91...)"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="w-full pl-3 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={isTesting || !testPhone.trim()}
                      onClick={async () => {
                        if (!testPhone.trim()) return;
                        setIsTesting(true);
                        setTestResult(null);
                        try {
                          const res = await fetch("/api/whatsapp/test", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ phone: testPhone.trim(), template_name: "hello_world" })
                          });
                          const data = await res.json();
                          if (data.success) {
                            setTestResult(`✅ Official Meta 'hello_world' Template sent to ${data.recipient || testPhone}! Check your WhatsApp.`);
                          } else {
                            setTestResult(`❌ Error: ${data.error || "Failed to deliver"}`);
                          }
                        } catch (err: any) {
                          setTestResult(`❌ Error: ${err.message || "Network error"}`);
                        } finally {
                          setIsTesting(false);
                        }
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shrink-0 flex items-center gap-1 border border-emerald-500/20"
                      title="Send Meta Hello World Template"
                    >
                      <span>Template Test</span>
                    </button>
                    <button
                      type="submit"
                      disabled={isTesting || !testPhone.trim()}
                      className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                    >
                      {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-emerald-400" />}
                      Send Notice
                    </button>
                  </div>
                </form>
                {testResult && (
                  <p className="text-[11px] text-slate-300 bg-slate-950/80 p-2 rounded-lg border border-slate-800">{testResult}</p>
                )}

                {/* Helpful note for Meta Sandbox test number */}
                <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-[11px] text-slate-300 leading-relaxed">
                  💡 <strong className="text-emerald-300">Sandbox টিপ:</strong> মেটার টেস্ট নম্বর হলো <span className="font-mono text-emerald-400 font-bold">+1 555-138-2853</span>। টেস্ট মোডে সম্পূর্ণ নোটিশ মেসেজ সরাসরি পেতে আপনার WhatsApp থেকে এই নম্বরে একবার <strong>"Hi"</strong> পাঠান (২৪ ঘণ্টার সার্ভিস উইন্ডো চালু করতে)।
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            type="button"
            onClick={fetchSessionAbsentees}
            disabled={loading || isSending}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors text-xs flex items-center gap-1.5 cursor-pointer"
            title="Refresh Absent List"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
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
              disabled={isSending || loading || absenteesWithPhone.length === 0}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Sending Alerts...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Send WhatsApp Alerts ({absenteesWithPhone.length})
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
