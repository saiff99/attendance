"use client";

import { useMemo, memo } from "react";
import {
  UserCheck, UserX, Search, X, Eye, CheckCircle2,
  Loader2, Check, RotateCcw
} from "lucide-react";
import type { AttendanceLogItem } from "./types";

interface AttendanceLogCardProps {
  log: AttendanceLogItem;
  isUndoing: boolean;
  onUndo: (logId: string) => void;
}

export const AttendanceLogCard = memo(function AttendanceLogCard({
  log,
  isUndoing,
  onUndo,
}: AttendanceLogCardProps) {
  const studentName = log.students?.full_name?.toUpperCase() || "UNKNOWN STUDENT";
  const studentRoll = log.students?.student_roll || "N/A";
  const formattedTime = useMemo(() => {
    try {
      return new Date(log.recorded_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "--:--:--";
    }
  }, [log.recorded_at]);
  const isManual = log.capture_mode === "Manual Upload" || log.capture_mode === "Manual Override";
  const initials = useMemo(() => studentName.substring(0, 2), [studentName]);

  return (
    <div className="flex items-center p-2 sm:p-2.5 rounded-xl border border-gray-200/80 dark:border-slate-800/80 bg-gray-50/70 dark:bg-slate-950/60 hover:bg-white dark:hover:bg-slate-950 hover:border-indigo-400 dark:hover:border-indigo-500/40 hover:shadow-sm transition-all group">
      {/* Avatar Initials Pill */}
      <div className="flex-shrink-0 mr-2 sm:mr-2.5">
        <div
          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-white font-bold text-[10px] sm:text-[11px] uppercase shadow-md ${
            isManual
              ? "bg-gradient-to-br from-purple-600 to-indigo-700 shadow-purple-600/20"
              : "bg-gradient-to-br from-indigo-600 to-indigo-800 shadow-indigo-600/20"
          }`}
        >
          {initials}
        </div>
      </div>

      <div className="flex-1 min-w-0 pr-2">
        <p className="text-xs font-bold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
          {studentName}
        </p>
        <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">
          <span className="font-mono bg-gray-200/80 dark:bg-slate-900 px-1 sm:px-1.5 py-0.5 rounded text-gray-700 dark:text-slate-300 border border-gray-300/80 dark:border-slate-800">
            {studentRoll}
          </span>
          {isManual && (
            <>
              <span>•</span>
              <span className="text-purple-600 dark:text-purple-400 font-semibold">Faculty Verified</span>
            </>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 text-right flex flex-col items-end gap-1">
        <span className="text-[9px] sm:text-[10px] text-gray-500 dark:text-slate-500 font-mono block">
          {formattedTime}
        </span>
        <div className="flex items-center gap-1">
          <span
            className={`inline-flex items-center text-[8px] sm:text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
              isManual
                ? "text-purple-700 dark:text-purple-300 bg-purple-500/10 border border-purple-500/20"
                : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
            }`}
          >
            {isManual ? "Manual" : "Present"}
          </span>
          {isManual && (
            <button
              type="button"
              disabled={isUndoing}
              onClick={() => onUndo(log.id)}
              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
              title="Undo manual attendance"
            >
              {isUndoing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RotateCcw className="w-2.5 h-2.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export interface AbsentStudentItem {
  id: string;
  full_name?: string;
  student_roll?: string | number;
  [key: string]: unknown;
}

interface AbsentStudentCardProps {
  student: AbsentStudentItem;
  isMarking: boolean;
  onMarkPresent: (studentId: string) => void;
}

export const AbsentStudentCard = memo(function AbsentStudentCard({
  student,
  isMarking,
  onMarkPresent,
}: AbsentStudentCardProps) {
  const studentName = (student.full_name as string | undefined)?.toUpperCase() || "UNKNOWN";
  const studentRoll = (student.student_roll as string | number | undefined) || "N/A";
  const studentId = student.id as string;
  const initials = useMemo(() => studentName.substring(0, 2), [studentName]);

  return (
    <div className="flex items-center justify-between p-2 sm:p-2.5 rounded-xl border border-gray-200/80 dark:border-slate-800/80 bg-gray-50/70 dark:bg-slate-950/60 hover:bg-white dark:hover:bg-slate-950 hover:border-emerald-500/40 hover:shadow-sm transition-all gap-2 min-w-0">
      {/* Avatar Initials Pill */}
      <div className="flex-shrink-0">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-[10px] sm:text-[11px] uppercase">
          {initials}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-900 dark:text-slate-200 truncate">
          {studentName}
        </p>
        <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">
          <span className="font-mono bg-gray-200/80 dark:bg-slate-900 px-1.5 py-0.5 rounded text-gray-700 dark:text-slate-300 border border-gray-300/80 dark:border-slate-800">
            {studentRoll}
          </span>
          <span>•</span>
          <span className="text-rose-500 dark:text-rose-400 font-medium">Unverified</span>
        </div>
      </div>

      {/* 1-Click Mark Present Button */}
      <button
        type="button"
        disabled={isMarking}
        onClick={() => onMarkPresent(studentId)}
        className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 transition-all shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
        title="1-Click Mark Present for unscanned student"
      >
        {isMarking ? (
          <Loader2 className="w-3 h-3 animate-spin text-white" />
        ) : (
          <Check className="w-3 h-3" />
        )}
        <span>Mark Present</span>
      </button>
    </div>
  );
});

export interface LiveAttendanceDrawerProps {
  sidebarTab: "present" | "absent";
  onTabChange: (tab: "present" | "absent") => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  logs: AttendanceLogItem[];
  absentStudents: AbsentStudentItem[];
  undoingLogId: string | null;
  markingStudentId: string | null;
  onUndoLog: (logId: string) => void;
  onMarkPresent: (studentId: string) => void;
}

export const LiveAttendanceDrawer = memo(function LiveAttendanceDrawer({
  sidebarTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  logs,
  absentStudents,
  undoingLogId,
  markingStudentId,
  onUndoLog,
  onMarkPresent,
}: LiveAttendanceDrawerProps) {
  // Filter logs based on search query
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter((log) => {
      const name = log.students?.full_name?.toLowerCase() || "";
      const roll = log.students?.student_roll?.toString().toLowerCase() || "";
      return name.includes(q) || roll.includes(q);
    });
  }, [logs, searchQuery]);

  // Filter absent students based on search query
  const filteredAbsentStudents = useMemo(() => {
    if (!searchQuery.trim()) return absentStudents;
    const q = searchQuery.toLowerCase();
    return absentStudents.filter((s) => {
      const name = (s.full_name as string | undefined)?.toLowerCase() || "";
      const roll = (s.student_roll as string | number | undefined)?.toString().toLowerCase() || "";
      return name.includes(q) || roll.includes(q);
    });
  }, [absentStudents, searchQuery]);

  return (
    <div className="w-full lg:w-[320px] xl:w-[360px] 2xl:w-[390px] flex-shrink-0 bg-white dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-md dark:shadow-xl border border-gray-200 dark:border-slate-800/90 flex flex-col overflow-hidden transition-colors duration-300">
      {/* Header with Navigation Tabs & Search */}
      <div className="p-3 sm:p-3.5 border-b border-gray-200 dark:border-slate-800/80 bg-gray-50/80 dark:bg-slate-950/50 flex flex-col gap-2.5">
        {/* Dual Tabs: Present vs Absent (Faculty Override) */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-gray-200/80 dark:bg-slate-900 border border-gray-300/80 dark:border-slate-800">
          <button
            type="button"
            onClick={() => onTabChange("present")}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              sidebarTab === "present"
                ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-emerald-500/20"
                : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Present ({logs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange("absent")}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              sidebarTab === "absent"
                ? "bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm border border-rose-500/20"
                : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
            }`}
            title="View absent students & use 1-Click Faculty Override for unscanned students"
          >
            <UserX className="w-3.5 h-3.5" />
            <span>Absent ({absentStudents.length})</span>
          </button>
        </div>

        {/* Quick Search Filter (Enforcing 16px font-size on mobile per Vault Gotcha 1) */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={sidebarTab === "present" ? "Search present students..." : "Search absent students to mark..."}
            className="w-full bg-white dark:bg-slate-950/80 border border-gray-200 dark:border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-base sm:text-xs text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Attendance List Container */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2 max-h-[340px] sm:max-h-[420px] lg:max-h-[calc(100vh-280px)] min-h-[180px] sm:min-h-[260px]">
        {sidebarTab === "present" ? (
          /* PRESENT TAB LIST */
          filteredLogs.length === 0 ? (
            <div className="text-center py-12 sm:py-16 px-4">
              <Eye className="w-7 h-7 sm:w-8 sm:h-8 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-gray-600 dark:text-slate-400">
                {searchQuery ? "No matching students found" : "Waiting for face matches..."}
              </p>
              <p className="text-[10px] sm:text-[11px] text-gray-400 dark:text-slate-500 mt-1">
                {searchQuery ? "Try a different search keyword." : "Students detected across CCTV or manually verified will appear here."}
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <AttendanceLogCard
                key={log.id}
                log={log}
                isUndoing={undoingLogId === log.id}
                onUndo={onUndoLog}
              />
            ))
          )
        ) : (
          /* ABSENT TAB LIST (WITH 1-CLICK FACULTY OVERRIDE) */
          <div className="space-y-2">
            {/* Tip Banner for Teachers */}
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] sm:text-[11px] leading-relaxed">
              💡 Click <strong>&quot;Mark Present&quot;</strong> for those whose faces have not been scanned.
            </div>

            {filteredAbsentStudents.length === 0 ? (
              <div className="text-center py-10 px-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-900 dark:text-white">
                  {searchQuery ? "No matching absent students" : "100% Attendance!"}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                  {searchQuery ? "Try a different search." : "All enrolled students are marked present."}
                </p>
              </div>
            ) : (
              filteredAbsentStudents.map((student) => (
                <AbsentStudentCard
                  key={student.id}
                  student={student}
                  isMarking={markingStudentId === student.id}
                  onMarkPresent={onMarkPresent}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
});
