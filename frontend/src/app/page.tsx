import { Users, UserCheck, CalendarCheck, Activity, CalendarDays, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import DownloadReportButton from "@/components/DownloadReportButton";
import { WhatsAppDashboardButton } from "@/components/WhatsAppDashboardButton";
import { AttendanceChart } from "@/components/AttendanceChart";
import { decodeSessionMetadata } from "@/lib/geofence";
import { FormattedDate } from "@/components/FormattedDate";

export const revalidate = 0; // Dynamic rendering

export default async function Dashboard() {
  // Fetch Total Students
  const { count: totalStudents } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true });

  // Get start of today in local date
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // Fetch Today's Total Attendances (Cumulative sum of all present attendances marked today)
  const { count: todayTotalPresent } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Present')
    .gte('recorded_at', startOfToday);

  // Fetch Today's Unique Attendance (unique students who attended classes today for Overall Distribution)
  const { data: todayAttendanceRecords } = await supabase
    .from('attendance')
    .select('student_id')
    .eq('status', 'Present')
    .gte('recorded_at', startOfToday);

  const uniquePresentStudentIds = new Set((todayAttendanceRecords || []).map(r => r.student_id));
  const todayUniquePresent = uniquePresentStudentIds.size;
  const totalRegistered = totalStudents || 0;
  const todayUniqueAbsent = Math.max(0, totalRegistered - todayUniquePresent);

  // Fetch Recent Sessions (Last 10)
  const { data: recentSessions } = await supabase
    .from('sessions')
    .select('id, class_name, instructor_name, created_at, attendance(count)')
    .neq('class_name', '__SYSTEM_CONFIG__')
    .order('created_at', { ascending: false })
    .limit(10);

  const lastClassPresent = recentSessions && recentSessions.length > 0 
    ? ((recentSessions[0].attendance as any)?.[0]?.count || 0)
    : 0;

  // Fetch attendance for the last 7 days for the chart
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const startDate = sevenDaysAgo.toISOString();

  const { data: recentAttendance } = await supabase
    .from('attendance')
    .select('status, recorded_at')
    .gte('recorded_at', startDate);

  const last7DaysMap = new Map();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last7DaysMap.set(dateStr, { date: d.toLocaleDateString('en-US', { weekday: 'short' }), present: 0, absent: 0 });
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
  const attendanceRate = totalPresentCount + totalAbsentCount > 0 
    ? Math.round((totalPresentCount / (totalPresentCount + totalAbsentCount)) * 100) 
    : 0;

  const stats = [
    { name: "Total Students", stat: totalStudents?.toString() || "0", icon: Users, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
    { name: "Present Last Class", stat: lastClassPresent.toString(), icon: UserCheck, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30" },
    { name: "Today's Total", stat: (todayTotalPresent || 0).toString(), icon: CalendarCheck, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-900/30" },
    { name: "Weekly Total", stat: totalPresentCount.toString(), icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  ];

  return (
    <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Dashboard Overview</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">Monitor live attendance and system status.</p>
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

        <div className="bg-white dark:bg-gray-900 shadow-sm border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden transition-colors duration-300 min-w-0 w-full">
          <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center">
              <CalendarDays className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">Recent Class Sessions</h2>
            </div>
            <span className="text-[11px] text-gray-400 sm:hidden">Scroll horizontally →</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[650px] w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date & Time</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Subject & Lecture Hall</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Topic Name</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Attendance Count</th>
                  <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {recentSessions && recentSessions.length > 0 ? recentSessions.map((session: any) => {
                  // Supabase returns count inside an array for one-to-many relationships when queried like attendance(count)
                  const attendanceCount = (session.attendance as any)?.[0]?.count || 0;
                  const topic = decodeSessionMetadata(session.instructor_name).topic;
                  
                  return (
                    <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        <FormattedDate date={session.created_at} />
                      </td>
                      <td className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                        {session.class_name}
                      </td>
                      <td className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        {topic}
                      </td>
                      <td className="px-4 sm:px-6 py-3.5 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${attendanceCount > 0 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}`}>
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
                }) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      No recent sessions found. Start a new live scan to see data here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
