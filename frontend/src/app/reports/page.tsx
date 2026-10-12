"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import {
  Search, Download, Users, AlertTriangle, CheckCircle, XCircle, BarChart3,
  ChevronDown, ChevronUp, Shield, UserCheck, UserX, Filter, RefreshCw, FileBarChart,
  GraduationCap, BookOpen, Sparkles
} from "lucide-react";
// Academic Attendance Reports Component
import { isCohortMatching } from "@/lib/cohort";
import { DEFAULT_MBBS_SUBJECTS, getSubjectsForCohort } from "@/lib/academicSubjects";

export interface SubjectBreakdown {
  subject: string;
  code?: string;
  department?: string;
  totalClasses: number;
  present: number;
  absent: number;
  percentage: number;
  status: "Good" | "Borderline" | "Low";
}

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
  subjectBreakdown?: SubjectBreakdown[];
}

type SortField = "full_name" | "student_roll" | "attendance_rate" | "total_present" | "total_absent";
type SortOrder = "asc" | "desc";
type RiskFilter = "all" | "critical" | "warning" | "good";

function RiskBadge({ rate, totalSessions }: { rate: number; totalSessions: number }) {
  if (totalSessions === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
        No Sessions
      </span>
    );
  }
  if (rate >= 75) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
      <CheckCircle className="w-2.5 h-2.5" /> Good Standing
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
  const [cohortFilter, setCohortFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sessionHistory, setSessionHistory] = useState<Record<string, any[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);
  const [totalSessions, setTotalSessions] = useState(0);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch reports");

      const allSessions = data.sessions || [];
      const sessionCount = allSessions.length;
      setTotalSessions(sessionCount);

      const students = data.students || [];
      const attendance = data.attendance || [];

      // Group attendance by student
      const attMap: Record<string, { present: number; manual: number; last?: string; attendedSessionIds: Set<string> }> = {};
      (attendance || []).forEach((a: any) => {
        if (!attMap[a.student_id]) {
          attMap[a.student_id] = { present: 0, manual: 0, attendedSessionIds: new Set() };
        }
        if (a.status === "Present") {
          attMap[a.student_id].present++;
          if (a.session_id) attMap[a.student_id].attendedSessionIds.add(a.session_id);
          if (a.capture_mode === "Manual Upload" || a.capture_mode === "Manual Entry") {
            attMap[a.student_id].manual++;
          }
          const d = a.recorded_at;
          if (!attMap[a.student_id].last || d > attMap[a.student_id].last!) {
            attMap[a.student_id].last = d;
          }
        }
      });

      // Fetch dynamic subjects if available
      let allCurriculumSubjects = DEFAULT_MBBS_SUBJECTS;
      if (data.subjects && data.subjects.length > 0) {
        allCurriculumSubjects = data.subjects;
      }

      const built: StudentReport[] = (students || []).map((s: any) => {
        const stats = attMap[s.id] || { present: 0, manual: 0, attendedSessionIds: new Set() };

        // Identify sessions targeted to or applicable to this student's specific cohort / year
        const applicableSessions = (allSessions || []).filter((sess: any) =>
          isCohortMatching(sess.target_academic_year, s.academic_year)
        );

        // Effective total sessions for this student
        const studentSessionCount = Math.max(applicableSessions.length, stats.attendedSessionIds.size);
        const present = stats.present;
        const absent = Math.max(0, studentSessionCount - present);
        const rate = studentSessionCount > 0 ? Math.min(100, Math.round((present / studentSessionCount) * 100)) : 0;

        // Compute Subject-wise Attendance Breakdown for this student
        const cohortSubs = getSubjectsForCohort(allCurriculumSubjects, s.academic_year);
        const subjectStatsMap: Record<string, { totalClasses: number; present: number }> = {};
        cohortSubs.forEach(sub => {
          subjectStatsMap[sub.name.toLowerCase()] = { totalClasses: 0, present: 0 };
        });

        applicableSessions.forEach((sess: any) => {
          const rawSub = sess.class_name?.includes(" - ") ? sess.class_name.split(" - ")[0].trim() : sess.class_name?.trim() || "General";
          const key = rawSub.toLowerCase();
          const matchedKey = Object.keys(subjectStatsMap).find(k => k === key || key.includes(k) || k.includes(key));
          if (matchedKey) {
            subjectStatsMap[matchedKey].totalClasses++;
            if (stats.attendedSessionIds.has(sess.id)) {
              subjectStatsMap[matchedKey].present++;
            }
          }
        });

        const subjectBreakdown: SubjectBreakdown[] = cohortSubs.map(sub => {
          const st = subjectStatsMap[sub.name.toLowerCase()] || { totalClasses: 0, present: 0 };
          const sAbsent = Math.max(0, st.totalClasses - st.present);
          const sRate = st.totalClasses > 0 ? Math.round((st.present / st.totalClasses) * 1000) / 10 : 100.0;
          let sStatus: "Good" | "Borderline" | "Low" = "Good";
          if (st.totalClasses > 0) {
            if (sRate >= 75) sStatus = "Good";
            else if (sRate >= 65) sStatus = "Borderline";
            else sStatus = "Low";
          }
          return {
            subject: sub.name,
            code: sub.code,
            department: sub.department,
            totalClasses: st.totalClasses,
            present: st.present,
            absent: sAbsent,
            percentage: sRate,
            status: sStatus,
          };
        });

        return {
          id: s.id,
          student_roll: s.student_roll,
          full_name: s.full_name,
          email: s.email,
          academic_year: s.academic_year,
          total_sessions: studentSessionCount,
          total_present: present,
          total_absent: absent,
          attendance_rate: rate,
          manual_override_count: stats.manual,
          last_seen: stats.last,
          subjectBreakdown,
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
      const res = await fetch(`/api/students/${studentId}/attendance`);
      const data = await res.json();
      if (res.ok && data.attendance) {
        setSessionHistory(prev => ({ ...prev, [studentId]: data.attendance || [] }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(null);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  const availableCohorts = useMemo(() => {
    const set = new Set<string>();
    reports.forEach(r => {
      if (r.academic_year) {
        const base = r.academic_year.replace(/\s*\([^)]*\)/g, "").replace(/\s*MBBS/i, "").trim();
        if (base) set.add(base);
      }
    });
    const sorted = Array.from(set).sort();
    return sorted.length > 0 ? sorted : ["1st Year", "2nd Year", "3rd Year", "4th Year"];
  }, [reports]);

  const summaryStats = useMemo(() => {
    const list = cohortFilter === "all"
      ? reports
      : reports.filter(r => r.academic_year?.startsWith(cohortFilter) || r.academic_year?.includes(cohortFilter));

    if (!list.length) return { total: 0, good: 0, warning: 0, critical: 0, avgRate: 0 };
    const withSessions = list.filter(r => r.total_sessions > 0);
    const good = withSessions.filter(r => r.attendance_rate >= 75).length;
    const warning = withSessions.filter(r => r.attendance_rate >= 50 && r.attendance_rate < 75).length;
    const critical = withSessions.filter(r => r.attendance_rate < 50).length;
    const avgRate = withSessions.length > 0
      ? Math.round(withSessions.reduce((s, r) => s + r.attendance_rate, 0) / withSessions.length)
      : 0;
    return { total: list.length, good, warning, critical, avgRate };
  }, [reports, cohortFilter]);

  const filtered = useMemo(() => {
    let list = [...reports];
    if (cohortFilter !== "all") {
      list = list.filter(r => r.academic_year?.startsWith(cohortFilter) || r.academic_year?.includes(cohortFilter));
    }
    const q = searchTerm.toLowerCase();
    if (q) list = list.filter(r => r.full_name.toLowerCase().includes(q) || r.student_roll.toLowerCase().includes(q));
    if (riskFilter === "critical") list = list.filter(r => r.total_sessions > 0 && r.attendance_rate < 50);
    else if (riskFilter === "warning") list = list.filter(r => r.total_sessions > 0 && r.attendance_rate >= 50 && r.attendance_rate < 75);
    else if (riskFilter === "good") list = list.filter(r => r.total_sessions > 0 && r.attendance_rate >= 75);
    list.sort((a, b) => {
      const aVal = a[sortField] as number | string;
      const bVal = b[sortField] as number | string;
      if (typeof aVal === "number" && typeof bVal === "number") return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      return sortOrder === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return list;
  }, [reports, cohortFilter, searchTerm, riskFilter, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(o => o === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortOrder("asc"); }
  };

  const exportCSV = () => {
    const headers = [
      "Roll No", "Full Name", "Email", "Year", "Total Sessions", "Present", "Absent", "Attendance %",
      "Subject Breakdown", "Manual Override", "Last Seen"
    ];
    const rows = filtered.map(r => {
      const subjectSummary = (r.subjectBreakdown || [])
        .map(s => `${s.subject}: ${s.percentage}% (${s.present}/${s.totalClasses})`)
        .join(" | ");
      return [
        r.student_roll, r.full_name, r.email, r.academic_year || "N/A",
        r.total_sessions, r.total_present, r.total_absent,
        r.attendance_rate + "%", subjectSummary, r.manual_override_count,
        r.last_seen ? new Date(r.last_seen).toLocaleString() : "Never"
      ].map(c => `"${c}"`).join(",");
    });
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
              Cohort-specific attendance breakdown across {totalSessions} total institutional sessions.
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
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {cohortFilter === "all" ? "Overall Institutional Attendance Rate" : `${cohortFilter} Average Attendance Rate`}
                </span>
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
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
              <GraduationCap className="w-4 h-4 text-indigo-500 shrink-0" />
              <select
                value={cohortFilter}
                onChange={e => setCohortFilter(e.target.value)}
                className="text-xs font-semibold bg-transparent text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-gray-900">All Batches</option>
                {availableCohorts.map(c => (
                  <option key={c} value={c} className="bg-white dark:bg-gray-900">{c}</option>
                ))}
              </select>
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
                  const hasSessions = student.total_sessions > 0;
                  const rateColor = !hasSessions
                    ? "text-gray-400 dark:text-gray-500"
                    : student.attendance_rate >= 75
                    ? "text-emerald-600 dark:text-emerald-400"
                    : student.attendance_rate >= 50
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400";
                  const barColor = !hasSessions
                    ? "bg-gray-300 dark:bg-gray-700"
                    : student.attendance_rate >= 75
                    ? "bg-emerald-500"
                    : student.attendance_rate >= 50
                    ? "bg-amber-500"
                    : "bg-rose-500";
                  const initials = student.full_name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
                  const avatarGrad = !hasSessions
                    ? "from-gray-400 to-slate-500"
                    : student.attendance_rate >= 75
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
                            <span className={`text-sm font-bold ${rateColor}`}>{hasSessions ? `${student.attendance_rate}%` : "—"}</span>
                            <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${hasSessions ? student.attendance_rate : 0}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <RiskBadge rate={student.attendance_rate} totalSessions={student.total_sessions} />
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-xs font-semibold transition-all cursor-pointer"
                          >
                            {isExpanded ? (
                              <><ChevronUp className="w-3.5 h-3.5" /> <span>Hide</span></>
                            ) : (
                              <><BookOpen className="w-3.5 h-3.5" /> <span>Breakdown</span></>
                            )}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-indigo-50/20 dark:bg-slate-900/40 border-b border-indigo-100/60 dark:border-slate-800">
                          <td colSpan={9} className="px-4 sm:px-6 py-5">
                            <div className="space-y-4">
                              {/* Subject-wise Attendance Breakdown Card */}
                              <div className="bg-white dark:bg-slate-950/90 border border-gray-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
                                  <div className="flex items-center gap-2">
                                    <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                                      Subject-wise Attendance Breakdown — {student.full_name} ({student.student_roll})
                                    </h4>
                                  </div>
                                  <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                                    {student.academic_year || "1st Year"} Curriculum
                                  </span>
                                </div>

                                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-800">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-gray-200 dark:border-slate-800">
                                        <th className="py-2.5 px-3">Subject</th>
                                        <th className="py-2.5 px-2 text-center">Total Classes</th>
                                        <th className="py-2.5 px-2 text-center">Present</th>
                                        <th className="py-2.5 px-2 text-center">Absent</th>
                                        <th className="py-2.5 px-3 text-center">Attendance Rate</th>
                                        <th className="py-2.5 px-3 text-center">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800/60">
                                      {(student.subjectBreakdown && student.subjectBreakdown.length > 0) ? (
                                        student.subjectBreakdown.map((sub, sIdx) => (
                                          <tr key={sIdx} className="hover:bg-gray-50/60 dark:hover:bg-slate-900/40 transition-colors">
                                            <td className="py-2.5 px-3">
                                              <span className="font-bold text-gray-900 dark:text-white">{sub.subject}</span>
                                              {sub.code && <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono ml-1.5">({sub.code})</span>}
                                            </td>
                                            <td className="py-2.5 px-2 text-center font-semibold text-gray-700 dark:text-slate-300">{sub.totalClasses}</td>
                                            <td className="py-2.5 px-2 text-center font-bold text-emerald-600 dark:text-emerald-400">{sub.present}</td>
                                            <td className="py-2.5 px-2 text-center font-bold text-rose-600 dark:text-rose-400">{sub.absent}</td>
                                            <td className="py-2.5 px-3 text-center">
                                              <div className="inline-flex flex-col items-center">
                                                <span className="font-extrabold text-gray-900 dark:text-white">{sub.percentage}%</span>
                                                <div className="w-16 bg-gray-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden mt-0.5">
                                                  <div
                                                    className={`h-full rounded-full ${
                                                      sub.percentage >= 75
                                                        ? "bg-emerald-500"
                                                        : sub.percentage >= 65
                                                        ? "bg-amber-500"
                                                        : "bg-rose-500"
                                                    }`}
                                                    style={{ width: `${Math.min(100, Math.max(0, sub.percentage))}%` }}
                                                  />
                                                </div>
                                              </div>
                                            </td>
                                            <td className="py-2.5 px-3 text-center">
                                              {sub.status === "Good" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                                  Good
                                                </span>
                                              ) : sub.status === "Borderline" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                                  Borderline
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                                                  Low
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        ))
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="py-4 text-center text-gray-400">
                                            No curriculum subjects available.
                                          </td>
                                        </tr>
                                      )}

                                      {/* Overall Summary Row */}
                                      <tr className="bg-gray-50/80 dark:bg-slate-900/90 font-black border-t border-gray-200 dark:border-slate-800">
                                        <td className="py-2.5 px-3 text-gray-900 dark:text-white flex items-center gap-1.5">
                                          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                                          <span>Overall Total</span>
                                        </td>
                                        <td className="py-2.5 px-2 text-center text-gray-900 dark:text-white">{student.total_sessions}</td>
                                        <td className="py-2.5 px-2 text-center text-emerald-600 dark:text-emerald-400">{student.total_present}</td>
                                        <td className="py-2.5 px-2 text-center text-rose-600 dark:text-rose-400">{student.total_absent}</td>
                                        <td className="py-2.5 px-3 text-center text-indigo-600 dark:text-indigo-400 font-extrabold text-sm">
                                          {student.attendance_rate}%
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                          <RiskBadge rate={student.attendance_rate} totalSessions={student.total_sessions} />
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Recent Recorded Session Badges */}
                              <div>
                                <p className="text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                                  Recent Session Timeline
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
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border ${
                                          rec.status === "Present"
                                            ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400"
                                            : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400"
                                        }`}
                                      >
                                        {rec.status === "Present" ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                        <span className="font-semibold">{rec.sessions?.class_name || "Session"}</span>
                                        <span className="opacity-60 text-[10px]">({new Date(rec.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span>
                                        {rec.capture_mode === "Manual Upload" && (
                                          <span className="text-[9px] bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-1 rounded font-bold">MANUAL</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
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
