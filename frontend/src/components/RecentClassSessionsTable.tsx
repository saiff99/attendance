"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { CalendarDays, RefreshCw, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { decodeSessionMetadata } from "@/lib/geofence";
import { FormattedDate } from "@/components/FormattedDate";
import { WhatsAppDashboardButton } from "@/components/WhatsAppDashboardButton";
import DownloadReportButton from "@/components/DownloadReportButton";

interface SessionItem {
  id: string;
  class_name: string;
  instructor_name?: string | null;
  created_at: string;
  attendance?: any;
}

interface RecentClassSessionsTableProps {
  initialSessions: SessionItem[];
}

export function RecentClassSessionsTable({ initialSessions }: RecentClassSessionsTableProps) {
  const { user, isLoading } = useAuth();
  const [sessions, setSessions] = useState<SessionItem[]>(initialSessions || []);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isFaculty = user?.role === "Faculty";
  const userUsername = (user?.username || "").toLowerCase();
  const userName = (user?.name || "").toLowerCase();

  // Client-side instant and authoritative filtering by authenticated role
  const displaySessions = useMemo(() => {
    if (isLoading) {
      // While auth loads, show empty array or initial
      return [];
    }

    if (!isFaculty) {
      // Super Admin sees all sessions
      return sessions.slice(0, 10);
    }

    // Faculty member: strictly filter to sessions created by this faculty
    const filtered = sessions.filter((session) => {
      const raw = session.instructor_name || "";
      const dec = decodeSessionMetadata(raw);
      const fac = (dec.facultyUsername || "").toLowerCase();
      const top = (dec.topic || "").toLowerCase();

      return (
        (fac && (fac === userUsername || fac === userName)) ||
        (top && (top === userUsername || top === userName))
      );
    });

    return filtered.slice(0, 10);
  }, [sessions, isFaculty, userUsername, userName, isLoading]);

  const refreshSessions = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/sessions?limit=60", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.sessions && Array.isArray(data.sessions)) {
          // If server already returned filtered sessions
          setSessions(data.sessions);
        }
      }
    } catch (e) {
      console.warn("Failed to refresh sessions:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 shadow-sm border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden transition-colors duration-300 min-w-0 w-full">
      <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarDays className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">
            {isFaculty
              ? `Recent Class Sessions (@${user?.username || "faculty"})`
              : "Recent Class Sessions"}
          </h2>
          {isFaculty ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Your Classes Only
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              Campus-Wide Overview
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshSessions}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Refresh session list"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
          </button>
          <span className="text-[11px] text-gray-400 sm:hidden">Scroll horizontally →</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[650px] w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Date & Time
              </th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Subject & Lecture Hall
              </th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Topic Name
              </th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Attendance Count
              </th>
              <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-xs text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Loading your class records...</span>
                  </div>
                </td>
              </tr>
            ) : displaySessions && displaySessions.length > 0 ? (
              displaySessions.map((session: any) => {
                const attendanceCount = (session.attendance as any)?.[0]?.count ?? 0;
                const topic = decodeSessionMetadata(session.instructor_name).topic;

                return (
                  <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      <FormattedDate date={session.created_at} />
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                      <div className="flex flex-col">
                        <span>{session.class_name}</span>
                        {!isFaculty && (
                          <span className="text-[11px] font-normal text-indigo-600 dark:text-indigo-400 mt-0.5">
                            {(() => {
                              const decoded = decodeSessionMetadata(session.instructor_name);
                              return decoded.facultyUsername ? `By: @${decoded.facultyUsername}` : "By: Faculty";
                            })()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {topic}
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          attendanceCount > 0
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                        }`}
                      >
                        {attendanceCount} Present
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <WhatsAppDashboardButton
                          sessionId={session.id}
                          sessionName={session.class_name}
                          topicName={topic}
                        />
                        <DownloadReportButton sessionId={session.id} sessionName={session.class_name} />
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 mb-3">
                      <CalendarDays className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                      {isFaculty ? "No Class Sessions Taken By You Yet" : "No recent sessions found"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
                      {isFaculty
                        ? "Sessions you launch from Live Scan will appear here for monitoring and alert management."
                        : "Start a new live scan to see session data here."}
                    </p>
                    {isFaculty && (
                      <Link
                        href="/live-scan"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-sm transition-all"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Launch Live Scan Session
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
