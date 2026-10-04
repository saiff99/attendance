"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import {
  Search, Download, Users, AlertTriangle, CheckCircle, XCircle, BarChart3,
  ChevronDown, ChevronUp, Shield, UserCheck, UserX, Filter, RefreshCw, FileBarChart
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface StudentReport {
  id: string;
  student_roll: string;
  full_name: string;
  email: string;
  academic_year?: string;
  total_sessions: number;
  total_present: number;
  total_absent: number;
  attendance_rate: number;
  manual_override_count: number;
  last_seen?: string;
}

type SortField = "full_name" | "student_roll" | "attendance_rate" | "total_present" | "total_absent";
type SortOrder = "asc" | "desc";
type RiskFilter = "all" | "critical" | "warning" | "good";

function RiskBadge({ rate }: { rate: number }) {
  if (rate >= 75) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
      <CheckCircle className="w-2.5 h-2.5" /> Good
    </span>
  );
  if (rate >= 50) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
      <AlertTriangle className="w-2.5 h-2.5" /> Warning
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
      <XCircle className="w-2.5 h-2.5" /> Critical
    </span>
  );
}

export default function ReportsPage() {
  const [reports, setReports] = useState<StudentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("attendance_rate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sessionHistory, setSessionHistory] = useState<Record<string, any[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);
  const [totalSessions, setTotalSessions] = useState(0);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data: allSessions } = await supabase
        .from("sessions")
        .select("id")
        .neq("class_name", "__SYSTEM_CONFIG__");
      const sessionCount = allSessions?.length || 0;
      setTotalSessions(sessionCount);

      const { data: students, error: stuErr } = await supabase
        .from("students")
        .select("id, student_roll, full_name, email, academic_year")
        .order("student_roll", { ascending: true });
      if (stuErr) throw stuErr;

      const { data: attendance, error: attErr } = await supabase
        .from("attendance")
        .select("student_id, status, capture_mode, recorded_at");
      if (attErr) throw attErr;

      const attMap: Record<string, { present: number; absent: number; manual: number; last?: string }> = {};
      (attendance || []).forEach((a: any) => {
        if (!attMap[a.student_id]) attMap[a.student_id] = { present: 0, absent: 0, manual: 0 };
        if (a.status === "Present") {
          attMap[a.student_id].present++;
          if (a.capture_mode === "Manual Upload") attMap[a.student_id].manual++;
          const d = a.recorded_at;
          if (!attMap[a.student_id].last || d > attMap[a.student_id].last!) attMap[a.student_id].last = d;
        } else {
          attMap[a.student_id].absent++;
        }
      });

      const built: StudentReport[] = (students || []).map((s: any) => {
        const stats = attMap[s.id] || { present: 0, absent: 0, manual: 0 };
        const rate = sessionCount > 0 ? Math.round((stats.present / sessionCount) * 100) : 0;
        return {
          id: s.id,
          student_roll: s.student_roll,
          full_name: s.full_name,
          email: s.email,
          academic_year: s.academic_year,
          total_sessions: sessionCount,
          total_present: stats.present,
          total_absent: Math.max(0, sessionCount - stats.present),
          attendance_rate: Math.min(rate, 100),
          manual_override_count: stats.manual,
          last_seen: stats.last,
        };
      });
      setReports(built);
    } catch (err) {
      console.error("Error fetching reports:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionHistory = async (studentId: string) => {
    if (sessionHistory[studentId]) return;
    setLoadingHistory(studentId);
    try {
      const { data } = await supabase
        .from("attendance")
        .select("status, capture_mode, recorded_at, sessions(class_name, date)")
        .eq("student_id", studentId)
        .order("recorded_at", { ascending: false })
        .limit(10);
      setSessionHistory(prev => ({ ...prev, [studentId]: data || [] }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(null);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  const summaryStats = useMemo(() => {
    if (!reports.length) return { total: 0, good: 0, warning: 0, critical: 0, avgRate: 0 };
    const good = reports.filter(r => r.attendance_rate >= 75).length;
    const warning = reports.filter(r => r.attendance_rate >= 50 && r.attendance_rate < 75).length;
    const critical = reports.filter(r => r.attendance_rate < 50).length;
    const avgRate = Math.round(reports.reduce((s, r) => s + r.attendance_rate, 0) / reports.length);
    return { total: reports.length, good, warning, critical, avgRate };
  }, [reports]);

  const filtered = useMemo(() => {
    let list = [...reports];
    const q = searchTerm.toLowerCase();
    if (q) list = list.filter(r => r.full_name.toLowerCase().includes(q) || r.student_roll.toLowerCase().includes(q));
    if (riskFilter === "critical") list = list.filter(r => r.attendance_rate < 50);
    else if (riskFilter === "warning") list = list.filter(r => r.attendance_rate >= 50 && r.attendance_rate < 75);
    else if (riskFilter === "good") list = list.filter(r => r.attendance_rate >= 75);
    list.sort((a, b) => {
      const aVal = a[sortField] as number | string;
      const bVal = b[sortField] as number | string;
      if (typeof aVal === "number" && typeof bVal === "number") return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      return sortOrder === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return list;
  }, [reports, searchTerm, riskFilter, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(o => o === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortOrder("asc"); }
  };

  const exportCSV = () => {
    const headers = ["Roll No", "Full Name", "Email", "Year", "Total Sessions", "Present", "Absent", "Attendance %", "Manual Override", "Last Seen"];
    const rows = filtered.map(r => [
      r.student_roll, r.full_name, r.email, r.academic_year || "N/A",
      r.total_sessions, r.total_present, r.total_absent,
      r.attendance_rate + "%", r.manual_override_count,
      r.last_seen ? new Date(r.last_seen).toLocaleString() : "Never"
    ].map(c => `"${c}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `student-attendance-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 text-gray-400 opacity-40" />;
    return sortOrder === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-500" /> : <ChevronDown className="w-3 h-3 text-indigo-500" />;
  };

  return (
    <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">

        {/* Header */}
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
                <FileBarChart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Student Reports</h1>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 ml-11">
              Per-student attendance breakdown across all {totalSessions} sessions.
            </p>
          </div>
          <div className="flex gap-2 ml-11 sm:ml-0">
            <button
              onClick={fetchReports}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm shadow-indigo-200 dark:shadow-none"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {[
            { label: "Total Students", value: summaryStats.total, icon: Users, bg: "bg-blue-50 dark:bg-blue-900/20", ring: "border-blue-100 dark:border-blue-900/40", iconColor: "text-blue-600 dark:text-blue-400" },
            { label: "Good Standing (≥75%)", value: summaryStats.good, icon: UserCheck, bg: "bg-emerald-50 dark:bg-emerald-900/20", ring: "border-emerald-100 dark:border-emerald-900/40", iconColor: "text-emerald-600 dark:text-emerald-400" },
            { label: "At Warning (50–74%)", value: summaryStats.warning, icon: AlertTriangle, bg: "bg-amber-50 dark:bg-amber-900/20", ring: "border-amber-100 dark:border-amber-900/40", iconColor: "text-amber-600 dark:text-amber-400" },
            { label: "Critical (<50%)", value: summaryStats.critical, icon: UserX, bg: "bg-rose-50 dark:bg-rose-900/20", ring: "border-rose-100 dark:border-rose-900/40", iconColor: "text-rose-600 dark:text-rose-400" },
          ].map(card => (
            <div key={card.label} className={`relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border ${card.ring} shadow-sm p-4 sm:p-5 flex items-center gap-3 sm:gap-4 transition-colors`}>
              <div className={`p-2.5 sm:p-3 rounded-xl ${card.bg} shrink-0`}>
                <card.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${card.iconColor}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 leading-tight">{card.label}</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mt-0.5">
                  {loading ? <span className="w-8 h-6 bg-gray-200 dark:bg-gray-700 animate-pulse rounded inline-block" /> : card.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Class Average Bar */}
        {!loading && summaryStats.total > 0 && (
          <div className="mb-6 p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Overall Class Attendance Rate</span>
              </div>
              <span className={`text-lg font-bold ${summaryStats.avgRate >= 75 ? "text-emerald-600 dark:text-emerald-400" : summaryStats.avgRate >= 50 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}>
                {summaryStats.avgRate}%
              </span>
            </div>
            <div className="w-full h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${summaryStats.avgRate >= 75 ? "bg-emerald-500" : summaryStats.avgRate >= 50 ? "bg-amber-500" : "bg-rose-500"}`}
                style={{ width: `${summaryStats.avgRate}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-gray-400">0%</span>
              <span className="text-[10px] text-amber-500 font-semibold">75% Threshold</span>
              <span className="text-[10px] text-gray-400">100%</span>
            </div>
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or roll number..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400 shrink-0" />
            {(["all", "critical", "warning", "good"] as RiskFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setRiskFilter(f)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold capitalize transition-all whitespace-nowrap ${
                  riskFilter === f
                    ? f === "critical" ? "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800"
                      : f === "warning" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800"
                      : f === "good" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                      : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-800"
                    : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-gray-300"
                }`}
              >
                {f === "all" ? "All" : f === "critical" ? "🔴 Critical" : f === "warning" ? "🟡 Warning" : "🟢 Good"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[750px] w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                  {[
                    { label: "Student", field: "full_name" as SortField },
                    { label: "Roll No", field: "student_roll" as SortField },
                    { label: "Year", field: null },
                    { label: "Present", field: "total_present" as SortField },
                    { label: "Absent", field: "total_absent" as SortField },
                    { label: "Rate", field: "attendance_rate" as SortField },
                    { label: "Status", field: null },
                    { label: "Manual", field: null },
                    { label: "", field: null },
                  ].map((col, i) => (
                    <th
                      key={i}
                      onClick={() => col.field && handleSort(col.field)}
                      className={`px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${col.field ? "cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none" : ""} transition-colors`}
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        {col.field && <SortIcon field={col.field} />}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(9)].map((_, j) => (
                        <td key={j} className="px-4 py-4">
                          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-sm text-gray-400 dark:text-gray-500">
                      <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      No students found. Adjust your search or filter.
                    </td>
                  </tr>
                ) : filtered.map(student => {
                  const isExpanded = expandedId === student.id;
                  const rateColor = student.attendance_rate >= 75
                    ? "text-emerald-600 dark:text-emerald-400"
                    : student.attendance_rate >= 50
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400";
                  const barColor = student.attendance_rate >= 75 ? "bg-emerald-500" : student.attendance_rate >= 50 ? "bg-amber-500" : "bg-rose-500";
                  const initials = student.full_name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
                  const avatarGrad = student.attendance_rate >= 75
                    ? "from-emerald-500 to-teal-600"
                    : student.attendance_rate >= 50
                    ? "from-amber-500 to-orange-600"
                    : "from-rose-500 to-pink-600";

                  return (
                    <Fragment key={student.id}>
                      <tr className={`hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${isExpanded ? "bg-indigo-50/30 dark:bg-indigo-950/20" : ""}`}>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${avatarGrad} text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-sm`}>
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[140px]">{student.full_name}</p>
                              <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate max-w-[140px]">{student.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 px-2 py-0.5 rounded border border-gray-200 dark:border-slate-700">
                            {student.student_roll}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {student.academic_year || "—"}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{student.total_present}</span>
                          <span className="text-[10px] text-gray-400 ml-1">/ {student.total_sessions}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm font-bold text-rose-600 dark:text-rose-400">{student.total_absent}</span>
                          <span className="text-[10px] text-gray-400 ml-1">/ {student.total_sessions}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-1 min-w-[70px]">
                            <span className={`text-sm font-bold ${rateColor}`}>{student.attendance_rate}%</span>
                            <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${student.attendance_rate}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <RiskBadge rate={student.attendance_rate} />
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {student.manual_override_count > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                              <Shield className="w-2.5 h-2.5" /> {student.manual_override_count}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={async () => {
                              if (isExpanded) { setExpandedId(null); }
                              else { setExpandedId(student.id); await fetchSessionHistory(student.id); }
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            {isExpanded ? <><ChevronUp className="w-3 h-3" /> Hide</> : <><ChevronDown className="w-3 h-3" /> History</>}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-indigo-50/40 dark:bg-indigo-950/10">
                          <td colSpan={9} className="px-4 py-4">
                            <div className="ml-10">
                              <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-3">
                                Last 10 Sessions — {student.full_name}
                              </p>
                              {loadingHistory === student.id ? (
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading history...
                                </div>
                              ) : !sessionHistory[student.id]?.length ? (
                                <p className="text-xs text-gray-400">No attendance records found.</p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {sessionHistory[student.id].map((rec: any, idx: number) => (
                                    <div
                                      key={idx}
                                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${
                                        rec.status === "Present"
                                          ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400"
                                          : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400"
                                      }`}
                                    >
                                      {rec.status === "Present" ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                      <span className="font-medium">{rec.sessions?.class_name || "Session"}</span>
                                      <span className="opacity-60">{new Date(rec.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                      {rec.capture_mode === "Manual Upload" && (
                                        <span className="text-[9px] bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-1 rounded font-bold">MANUAL</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex items-center justify-between flex-wrap gap-2">
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Showing <strong className="text-gray-700 dark:text-gray-300">{filtered.length}</strong> of <strong className="text-gray-700 dark:text-gray-300">{reports.length}</strong> students
              </p>
              <div className="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> ≥75% Good</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> 50–74% Warning</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> &lt;50% Critical</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
