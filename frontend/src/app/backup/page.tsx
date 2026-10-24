"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Database, Download, Upload, HardDrive, FileJson, CheckCircle2,
  AlertTriangle, RefreshCw, Loader2, ShieldAlert, GraduationCap,
  BookOpen, Building2
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function DatabaseBackupPage() {
  const router = useRouter();
  const { user: currentUser, isLoading: isAuthLoading } = useAuth();

  // Database Stats State
  const [dbStats, setDbStats] = useState<{ students: number; sessions: number; attendance: number; subjects: number } | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // Backup Download State
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [backupDownloadSuccess, setBackupDownloadSuccess] = useState<string | null>(null);
  const [backupDownloadError, setBackupDownloadError] = useState<string | null>(null);

  // Restore State
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const [backupPreview, setBackupPreview] = useState<{
    exported_at?: string;
    record_counts?: { students: number; sessions: number; attendance: number; subjects: number };
    checksum?: string;
    payloadData?: any;
  } | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState<{
    students: number;
    sessions: number;
    attendance: number;
    subjects: number;
  } | null>(null);
  const [isRestoreConfirmModalOpen, setIsRestoreConfirmModalOpen] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");

  // Role Gate: Super Admin ONLY
  useEffect(() => {
    if (!isAuthLoading && currentUser && currentUser.role !== "Super Admin") {
      router.push("/");
    }
  }, [currentUser, isAuthLoading, router]);

  const fetchDbStats = async () => {
    setIsStatsLoading(true);
    try {
      const res = await fetch("/api/admin/backup?action=stats");
      const data = await res.json();
      if (res.ok && data.success && data.stats) {
        setDbStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to load db stats:", err);
    } finally {
      setIsStatsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === "Super Admin") {
      fetchDbStats();
    }
  }, [currentUser?.role]);

  const handleDownloadBackup = async () => {
    setIsDownloadingBackup(true);
    setBackupDownloadError(null);
    setBackupDownloadSuccess(null);
    try {
      const res = await fetch("/api/admin/backup");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Download failed with HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const contentDisposition = res.headers.get("content-disposition");
      let filename = `medattend_backup_${new Date().toISOString().slice(0, 10)}.json`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setBackupDownloadSuccess(`Backup downloaded successfully as ${filename} (${(blob.size / 1024).toFixed(1)} KB)`);
    } catch (err: any) {
      setBackupDownloadError(err.message || "Failed to download backup");
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setRestoreError(null);
    setRestoreSuccess(null);
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      setRestoreError("Please select a valid .json MedAttend backup file.");
      return;
    }
    setSelectedBackupFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed || !parsed.data) {
          setRestoreError("Invalid backup format: missing 'data' container.");
          setBackupPreview(null);
          return;
        }
        setBackupPreview({
          exported_at: parsed.exported_at,
          record_counts: parsed.record_counts || {
            students: parsed.data.students?.length || 0,
            sessions: parsed.data.sessions?.length || 0,
            attendance: parsed.data.attendance?.length || 0,
            subjects: parsed.data.subjects?.length || 0,
          },
          checksum: parsed.checksum,
          payloadData: parsed,
        });
      } catch {
        setRestoreError("Failed to parse JSON file. Ensure the file is not corrupted.");
        setBackupPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    if (!backupPreview?.payloadData) return;
    setIsRestoring(true);
    setRestoreError(null);
    setRestoreSuccess(null);
    try {
      const res = await fetch("/api/admin/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backupPreview.payloadData),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Database restore failed");
      }
      setRestoreSuccess(data.restored_counts);
      setIsRestoreConfirmModalOpen(false);
      setRestoreConfirmText("");
      setSelectedBackupFile(null);
      setBackupPreview(null);
      fetchDbStats();
    } catch (err: any) {
      setRestoreError(err.message || "Failed to restore database");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 p-4 sm:p-6 lg:p-8 transition-colors">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400">
                <Database className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2.5">
                Database Backup & Disaster Recovery
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Live Supabase Sync
                </span>
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 ml-11">
              Export complete biometric snapshots, class sessions, and historical attendance logs with SHA-256 integrity protection.
            </p>
          </div>

          <div className="flex gap-2 ml-11 sm:ml-0">
            <button
              type="button"
              onClick={fetchDbStats}
              disabled={isStatsLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isStatsLoading ? "animate-spin" : ""}`} /> Refresh Counts
            </button>
          </div>
        </div>

        {/* Status alerts */}
        {backupDownloadSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{backupDownloadSuccess}</span>
            </div>
            <button onClick={() => setBackupDownloadSuccess(null)} className="text-emerald-600 hover:text-emerald-800">✕</button>
          </div>
        )}

        {backupDownloadError && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{backupDownloadError}</span>
            </div>
            <button onClick={() => setBackupDownloadError(null)} className="text-rose-600 hover:text-rose-800">✕</button>
          </div>
        )}

        {restoreSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-2 font-bold mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Database Restoration Successful!</span>
            </div>
            <p className="ml-6">
              Successfully merged: <b>{restoreSuccess.students}</b> students, <b>{restoreSuccess.sessions}</b> sessions, <b>{restoreSuccess.attendance}</b> attendance logs, and <b>{restoreSuccess.subjects}</b> subjects.
            </p>
          </div>
        )}

        {restoreError && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{restoreError}</span>
            </div>
            <button onClick={() => setRestoreError(null)} className="text-rose-600 hover:text-rose-800">✕</button>
          </div>
        )}

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Students</span>
              <GraduationCap className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {isStatsLoading ? "..." : (dbStats?.students ?? "...")}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">With biometric embeddings</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Class Sessions</span>
              <BookOpen className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {isStatsLoading ? "..." : (dbStats?.sessions ?? "...")}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">Active & archived lectures</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Attendance Records</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {isStatsLoading ? "..." : (dbStats?.attendance ?? "...")}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">Verified attendance logs</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">MBBS Subjects</span>
              <Building2 className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {isStatsLoading ? "..." : (dbStats?.subjects ?? "...")}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">Curriculum departments</p>
          </div>
        </div>

        {/* Actions Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CARD 1: EXPORT & DOWNLOAD BACKUP */}
          <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">1-Click Database Backup</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Download complete snapshot to your computer</p>
                </div>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                Exports all registered students (with 512D ArcFace biometric vectors & DPDP consent records), class sessions, and historical attendance logs into a structured JSON file with SHA-256 integrity hash.
              </p>

              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/60 mb-6 text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span>Backup Format</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">JSON (Universal Structured)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Integrity Assurance</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">SHA-256 Checksum Included</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Compatibility</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">100% Offline Re-Importable</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadBackup}
              disabled={isDownloadingBackup}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
            >
              {isDownloadingBackup ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating Backup Snapshot...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Download Complete Backup (.json)
                </>
              )}
            </button>
          </div>

          {/* CARD 2: RESTORE FROM BACKUP */}
          <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Disaster Recovery / Restore</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Restore or sync data from a saved backup file</p>
                </div>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                Restores your students, class sessions, and attendance history safely into Supabase. Employs foreign-key ordered Upserts to merge records without creating duplicates or breaking relations.
              </p>

              {/* File Upload Box */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Select MedAttend Backup File (.json)
                </label>
                <label className="border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-gray-50/50 dark:bg-gray-800/30 transition-all">
                  <FileJson className="w-6 h-6 text-indigo-500 mb-1.5" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {selectedBackupFile ? selectedBackupFile.name : "Click to select .json backup file"}
                  </span>
                  <span className="text-[11px] text-gray-400 mt-0.5">
                    {selectedBackupFile ? `${(selectedBackupFile.size / 1024).toFixed(1)} KB` : "Supports MedAttend v2.0 backups"}
                  </span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Backup Preview Panel */}
              {backupPreview && (
                <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 mb-4 text-xs text-emerald-900 dark:text-emerald-300 space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span>Backup Validated</span>
                    <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                      {backupPreview.exported_at ? new Date(backupPreview.exported_at).toLocaleString() : "Recent"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 text-[11px]">
                    <div>• Students: <b>{backupPreview.record_counts?.students ?? 0}</b></div>
                    <div>• Sessions: <b>{backupPreview.record_counts?.sessions ?? 0}</b></div>
                    <div>• Attendance: <b>{backupPreview.record_counts?.attendance ?? 0}</b></div>
                    <div>• Subjects: <b>{backupPreview.record_counts?.subjects ?? 0}</b></div>
                  </div>
                  {backupPreview.checksum && (
                    <div className="pt-1 text-[10px] text-gray-500 dark:text-gray-400 truncate">
                      Hash: <code className="font-mono">{backupPreview.checksum.slice(0, 24)}...</code>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!backupPreview || isRestoring}
              onClick={() => {
                setRestoreConfirmText("");
                setIsRestoreConfirmModalOpen(true);
              }}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-40"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Restoring Database...
                </>
              ) : (
                <>
                  <HardDrive className="w-4 h-4" /> Review & Restore Database
                </>
              )}
            </button>
          </div>
        </div>

        {/* Modal: Database Disaster Recovery Restore Confirmation */}
        {isRestoreConfirmModalOpen && backupPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 border border-gray-100 dark:border-gray-800 text-left animate-scaleIn">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Confirm Database Restoration
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Disaster Recovery & Data Synchronization
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 mb-4 leading-relaxed">
                <p className="font-semibold mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  Notice: Upsert Merging Process
                </p>
                You are about to restore data into the live Supabase database. Existing records matching record IDs will be updated with snapshot data, and missing records will be inserted cleanly.
              </div>

              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 mb-4 text-xs space-y-2">
                <div className="font-semibold text-gray-700 dark:text-gray-300">
                  Records to be restored / synchronized:
                </div>
                <div className="grid grid-cols-2 gap-2 text-gray-600 dark:text-gray-400">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <span>Students</span>
                    <span className="font-bold text-gray-900 dark:text-white">{backupPreview.record_counts?.students ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <span>Class Sessions</span>
                    <span className="font-bold text-gray-900 dark:text-white">{backupPreview.record_counts?.sessions ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <span>Attendance Logs</span>
                    <span className="font-bold text-gray-900 dark:text-white">{backupPreview.record_counts?.attendance ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <span>MBBS Subjects</span>
                    <span className="font-bold text-gray-900 dark:text-white">{backupPreview.record_counts?.subjects ?? 0}</span>
                  </div>
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Type <span className="font-mono font-bold text-rose-600 dark:text-rose-400">RESTORE</span> to authorize operation:
                </label>
                <input
                  type="text"
                  placeholder="RESTORE"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono tracking-wider focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {restoreError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{restoreError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRestoreConfirmModalOpen(false);
                    setRestoreConfirmText("");
                    setRestoreError(null);
                  }}
                  disabled={isRestoring}
                  className="w-1/2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRestore}
                  disabled={restoreConfirmText.trim().toUpperCase() !== "RESTORE" || isRestoring}
                  className="w-1/2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {isRestoring ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Restoring...</span>
                    </>
                  ) : (
                    <>
                      <HardDrive className="w-4 h-4" />
                      <span>Authorize & Restore</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
