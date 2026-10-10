"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  ShieldCheck, 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  Filter, 
  User, 
  Calendar, 
  Clock, 
  Database, 
  FileText, 
  AlertTriangle, 
  Trash2, 
  UserPlus, 
  ScanFace, 
  Edit3, 
  CheckCircle2, 
  Info, 
  X, 
  ChevronRight,
  Download
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

interface AuditLogEntry {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
}

export default function AuditLogsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedActionFilter, setSelectedActionFilter] = useState("all");
  const [selectedTargetFilter, setSelectedTargetFilter] = useState("all");
  const [selectedLogForModal, setSelectedLogForModal] = useState<AuditLogEntry | null>(null);

  const isSuperAdmin = user?.role === "Super Admin";

  const fetchLogs = async () => {
    if (!isSuperAdmin) return;
    try {
      setIsRefreshing(true);
      const res = await fetch("/api/audit-logs?limit=200", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      } else {
        console.error("Failed to fetch audit logs:", res.statusText);
      }
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isSuperAdmin) {
      fetchLogs();
    } else if (!authLoading && !isSuperAdmin) {
      setLoading(false);
    }
  }, [authLoading, isSuperAdmin]);

  // Filtered logs based on search and dropdown filters
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Action filter
      if (selectedActionFilter !== "all" && log.action !== selectedActionFilter) {
        return false;
      }

      // 2. Target type filter
      if (selectedTargetFilter !== "all" && log.target_type !== selectedTargetFilter) {
        return false;
      }

      // 3. Search query
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const actionMatch = log.action.toLowerCase().includes(term);
        const actorMatch = log.actor_id?.toLowerCase().includes(term);
        const targetTypeMatch = log.target_type?.toLowerCase().includes(term);
        const targetIdMatch = log.target_id?.toLowerCase().includes(term);
        const detailsMatch = log.details ? JSON.stringify(log.details).toLowerCase().includes(term) : false;

        return actionMatch || actorMatch || targetTypeMatch || targetIdMatch || detailsMatch;
      }

      return true;
    });
  }, [logs, selectedActionFilter, selectedTargetFilter, searchTerm]);

  // Analytics Metrics
  const metrics = useMemo(() => {
    const total = logs.length;
    const biometricEvents = logs.filter(l => l.action.includes("FACE")).length;
    const deletions = logs.filter(l => l.action.includes("DELETE")).length;
    const creations = logs.filter(l => l.action.includes("CREATE")).length;
    return { total, biometricEvents, deletions, creations };
  }, [logs]);

  // Action badge styles and human-readable names
  const getActionBadge = (action: string) => {
    if (action.includes("DELETE")) {
      return {
        bg: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-900/50",
        icon: Trash2,
        label: action.replace(/_/g, " "),
      };
    }
    if (action.includes("FACE") || action.includes("BIOMETRIC")) {
      return {
        bg: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border-purple-200 dark:border-purple-900/50",
        icon: ScanFace,
        label: action.replace(/_/g, " "),
      };
    }
    if (action.includes("CREATE") || action.includes("INSERT")) {
      return {
        bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50",
        icon: UserPlus,
        label: action.replace(/_/g, " "),
      };
    }
    if (action.includes("UPDATE") || action.includes("EDIT")) {
      return {
        bg: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-900/50",
        icon: Edit3,
        label: action.replace(/_/g, " "),
      };
    }
    return {
      bg: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-900/50",
      icon: Info,
      label: action.replace(/_/g, " "),
    };
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return {
        dateStr: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
        timeStr: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
      };
    } catch {
      return { dateStr: isoString, timeStr: "" };
    }
  };

  // Export audit logs to JSON
  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `medattend_audit_logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // 1. Loading screen
  if (authLoading || (loading && isSuperAdmin)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading secure audit trail...</p>
      </div>
    );
  }

  // 2. Access Denied screen for Non-Admin / Faculty / Student
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-900/50 mb-5 shadow-inner">
          <ShieldAlert className="w-12 h-12 text-rose-600 dark:text-rose-400 mx-auto" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
          Access Restricted • Super Admin Only
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6 leading-relaxed">
          The System Audit Trail contains sensitive biometric and governance logs. Your current account role (<span className="font-semibold text-rose-600 dark:text-rose-400">{user?.role || "Faculty / Guest"}</span>) does not have permission to view this page.
        </p>
        <Link
          href="/"
          className="inline-flex items-center px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all shadow-md hover:shadow-indigo-500/25"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  // 3. Super Admin Audit Log Dashboard
  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200/50 dark:border-indigo-800/50">
              <ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                System Security & Audit Trail
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                DPDP Act 2023 Compliant Biometric & Administrative Event Log
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-750 transition-all shadow-sm cursor-pointer disabled:opacity-50"
            title="Refresh logs from Supabase"
          >
            <RefreshCw className={`w-4 h-4 text-indigo-600 dark:text-indigo-400 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{isRefreshing ? "Refreshing..." : "Live Refresh"}</span>
          </button>

          <button
            onClick={handleExportJson}
            disabled={filteredLogs.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
            title="Export filtered logs as JSON"
          >
            <Download className="w-4 h-4" />
            <span>Export Log</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Events</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mt-2">{metrics.total}</p>
          <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 block">Recorded in audit ledger</span>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Face Biometrics</span>
            <div className="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-purple-600 dark:text-purple-400">
              <ScanFace className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400 mt-2">{metrics.biometricEvents}</p>
          <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 block">Enrollments & Resets</span>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Deletions</span>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/40 rounded-xl text-rose-600 dark:text-rose-400">
              <Trash2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400 mt-2">{metrics.deletions}</p>
          <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 block">Records permanently purged</span>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Enrolled Profiles</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl text-emerald-600 dark:text-emerald-400">
              <UserPlus className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{metrics.creations}</p>
          <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 block">New students registered</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-gray-900 p-3 sm:p-4 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by student roll, actor, action name, or details..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action Filter */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <select
            value={selectedActionFilter}
            onChange={(e) => setSelectedActionFilter(e.target.value)}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80 rounded-xl text-xs sm:text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All Actions</option>
            <option value="ENROLL_FACE">Face Enrolled</option>
            <option value="CREATE_STUDENT">Student Created</option>
            <option value="UPDATE_STUDENT">Student Updated</option>
            <option value="DELETE_STUDENT">Student Deleted</option>
            <option value="BULK_DELETE_STUDENTS">Bulk Deletions</option>
          </select>

          <select
            value={selectedTargetFilter}
            onChange={(e) => setSelectedTargetFilter(e.target.value)}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80 rounded-xl text-xs sm:text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All Targets</option>
            <option value="student">Student Target</option>
            <option value="attendance">Attendance Target</option>
            <option value="session">Session Target</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 text-[11px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider">
                <th className="py-3 px-4 sm:px-6">Timestamp</th>
                <th className="py-3 px-4">Action Event</th>
                <th className="py-3 px-4">Target</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Details</th>
                <th className="py-3 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-sm">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400 dark:text-gray-500">
                    <Database className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">No audit events match your search/filter criteria.</p>
                    <span className="text-xs text-gray-400 block mt-1">Actions performed by admins will show up here automatically.</span>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((entry) => {
                  const badge = getActionBadge(entry.action);
                  const BadgeIcon = badge.icon;
                  const { dateStr, timeStr } = formatDate(entry.created_at);

                  return (
                    <tr 
                      key={entry.id}
                      className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white block text-xs sm:text-sm">{timeStr}</span>
                            <span className="text-[11px] text-gray-400 block">{dateStr}</span>
                          </div>
                        </div>
                      </td>

                      {/* Action Event Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.bg}`}>
                          <BadgeIcon className="w-3.5 h-3.5" />
                          <span className="capitalize">{badge.label}</span>
                        </span>
                      </td>

                      {/* Target */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div>
                          <span className="font-medium text-gray-900 dark:text-gray-100 text-xs sm:text-sm">
                            {entry.target_id || "System"}
                          </span>
                          <span className="text-[11px] text-gray-400 dark:text-gray-500 block uppercase font-mono">
                            {entry.target_type}
                          </span>
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">
                          <User className="w-3 h-3 text-gray-400" />
                          {entry.actor_id}
                        </span>
                      </td>

                      {/* Details summary */}
                      <td className="py-3.5 px-4 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                        {entry.details ? (
                          <span>
                            {Object.entries(entry.details)
                              .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                              .join(" • ")}
                          </span>
                        ) : (
                          <span className="italic text-gray-400">No additional payload</span>
                        )}
                      </td>

                      {/* Inspect button */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLogForModal(entry)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline cursor-pointer"
                        >
                          <span>Inspect</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Modal Drawer for Inspecting Raw Log Event */}
      {selectedLogForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Audit Event Details</h3>
              </div>
              <button
                onClick={() => setSelectedLogForModal(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                  <span className="text-gray-400 block mb-0.5 font-medium">Event ID</span>
                  <span className="font-mono text-gray-800 dark:text-gray-200 break-all">{selectedLogForModal.id}</span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                  <span className="text-gray-400 block mb-0.5 font-medium">Action</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedLogForModal.action}</span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                  <span className="text-gray-400 block mb-0.5 font-medium">Actor</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{selectedLogForModal.actor_id}</span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                  <span className="text-gray-400 block mb-0.5 font-medium">Target ({selectedLogForModal.target_type})</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{selectedLogForModal.target_id || "N/A"}</span>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-2">
                  Payload Details (JSON)
                </span>
                <pre className="p-3 bg-gray-900 text-gray-100 rounded-xl text-xs font-mono overflow-x-auto border border-gray-800 max-h-56">
                  {JSON.stringify(selectedLogForModal.details, null, 2)}
                </pre>
              </div>

              <div className="text-[11px] text-gray-400 flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
                <span>Timestamp: {new Date(selectedLogForModal.created_at).toLocaleString("en-IN")}</span>
                <span>IP: {selectedLogForModal.ip_address || "Local/Internal"}</span>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex justify-end">
              <button
                onClick={() => setSelectedLogForModal(null)}
                className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white text-xs font-semibold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
