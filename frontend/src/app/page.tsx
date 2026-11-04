import { cookies } from "next/headers";
import nextDynamic from "next/dynamic";
import { Users, UserCheck, CalendarCheck, Activity, CalendarDays, TrendingUp } from "lucide-react";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStartOfTodayISO } from "@/lib/dateUtils";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/serverAuth";
import { RecentClassSessionsTable } from "@/components/RecentClassSessionsTable";
import { decodeSessionMetadata } from "@/lib/geofence";
import { getCachedUserMap } from "@/lib/userCache";

const AttendanceChart = nextDynamic(
  () => import("@/components/AttendanceChart").then((mod) => mod.AttendanceChart),
  {
    loading: () => (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 animate-pulse">
        <div className="lg:col-span-2 h-72 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800" />
        <div className="h-72 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800" />
      </div>
    ),
  }
);

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Dashboard() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const userSession = sessionCookie ? await verifySessionToken(sessionCookie) : null;
  const isFaculty = userSession?.role === "Faculty";

  // Get start of today in IST local date
  const startOfToday = getStartOfTodayISO();

  // Fetch attendance for the last 7 days for the chart
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const startDate = sevenDaysAgo.toISOString();

  // Fetch all independent dashboard data concurrently via Promise.all (Eliminates async waterfall)
  const [
    totalStudentsRes,
    todayTotalPresentRes,
    todayAttendanceRes,
    rawSessionsRes,
    userMap,
    recentAttendanceRes,
  ] = await Promise.all([
    // 1. Total Registered Active Students Count (Excludes archived/graduated students)
    supabaseServer
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),

    // 2. Today's Total Present Attendances (Cumulative sum of present records marked today)
    supabaseServer
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Present')
      .gte('recorded_at', startOfToday),

    // 3. Today's Unique Attendance Records (For unique student distribution & absence calculation)
    supabaseServer
      .from('attendance')
      .select('student_id')
      .eq('status', 'Present')
      .gte('recorded_at', startOfToday),

    // 4. Recent Active Sessions (utilizes partial composite index idx_sessions_active_created)
    supabaseServer
      .from('sessions')
      .select('id, class_name, instructor_name, created_at, attendance(count)')
      .eq('is_archived', false)
      .neq('class_name', '__SYSTEM_CONFIG__')
      .neq('class_name', '__GEOFENCE_CONFIG__')
      .order('created_at', { ascending: false })
      .limit(80),

    // 5. In-Memory Cached User Map (5-minute TTL, eliminates redundant DB query on every page load)
    getCachedUserMap(),

    // 6. Last 7 days attendance records for the chart
    supabaseServer
      .from('attendance')
      .select('status, recorded_at')
      .gte('recorded_at', startDate),
  ]);

  const totalStudents = totalStudentsRes.count;
  const todayTotalPresent = todayTotalPresentRes.count;
  const todayAttendanceRecords = todayAttendanceRes.data;
  const rawSessions = rawSessionsRes.data;
  const recentAttendance = recentAttendanceRes.data;

  const uniquePresentStudentIds = new Set((todayAttendanceRecords || []).map(r => r.student_id));
  const todayUniquePresent = uniquePresentStudentIds.size;
  const totalRegistered = totalStudents || 0;
  const todayUniqueAbsent = Math.max(0, totalRegistered - todayUniquePresent);

  const enrichedRawSessions = (rawSessions || []).map((s: any) => {
    const meta = decodeSessionMetadata(s.instructor_name || "");
    const facUser = (meta.facultyUsername || "").toLowerCase();
    return {
      ...s,
      creator_name: userMap[facUser] || (meta.facultyUsername ? (meta.facultyUsername.startsWith("@") ? meta.facultyUsername.slice(1) : meta.facultyUsername) : null),
    };
  });

  const lastClassPresent = rawSessions && rawSessions.length > 0 
    ? ((rawSessions[0].attendance as any)?.[0]?.count || 0)
    : 0;

  const last7DaysMap = new Map();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    const weekdayStr = d.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
    last7DaysMap.set(dateStr, { date: weekdayStr, present: 0, absent: 0 });
  }

  let totalPresentCount = 0;
  let totalAbsentCount = 0;

  if (recentAttendance) {
    recentAttendance.forEach((record: any) => {
      const dateStr = record.recorded_at.split('T')[0];
      if (last7DaysMap.has(dateStr)) {
        const entry = last7DaysMap.get(dateStr);
        if (record.status === 'Present') {
          entry.present++;
          totalPresentCount++;
        } else {
          entry.absent++;
          totalAbsentCount++;
        }
      }
    });
  }

  const chartData = Array.from(last7DaysMap.values());

  const stats = [
    { name: "Total Students", stat: totalStudents?.toString() || "0", icon: Users, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
    { 
      name: "Present Last Class", 
      stat: lastClassPresent.toString(), 
      icon: UserCheck, 
      color: "text-green-600 dark:text-green-400", 
      bg: "bg-green-100 dark:bg-green-900/30" 
    },
    { name: "Today's Total", stat: (todayTotalPresent || 0).toString(), icon: CalendarCheck, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-900/30" },
    { name: "Weekly Total", stat: totalPresentCount.toString(), icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  ];

  return (
    <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Dashboard Overview</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Monitor live attendance records and academic lecture sessions.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
          {stats.map((item) => (
            <div
              key={item.name}
              className="relative overflow-hidden rounded-xl bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center transition-colors duration-300"
            >
              <div className={`p-3 sm:p-4 rounded-xl ${item.bg} mr-3 sm:mr-4 shrink-0`}>
                <item.icon className={`h-6 w-6 sm:h-8 sm:w-8 ${item.color}`} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">{item.name}</p>
                <p className="mt-0.5 sm:mt-1 text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">{item.stat}</p>
              </div>
            </div>
          ))}
        </div>

        <AttendanceChart data={chartData} todayPresent={todayUniquePresent} todayAbsent={todayUniqueAbsent} totalStudents={totalRegistered} />

        <RecentClassSessionsTable initialSessions={enrichedRawSessions || []} userRole={userSession?.role || null} />
      </div>
    </div>
  );
}
