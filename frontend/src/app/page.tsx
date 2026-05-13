/* eslint-disable */
import { Users, UserCheck, UserMinus, Activity, CalendarDays, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import DownloadReportButton from "@/components/DownloadReportButton";
import { AttendanceChart } from "@/components/AttendanceChart";

export const revalidate = 0; // Dynamic rendering

export default async function Dashboard() {
  // Fetch Total Students
  const { count: totalStudents } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true });

  // Get today's date in YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];

  // Fetch Absent Today
  const { count: absentToday } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Absent')
    .gte('recorded_at', `${today}T00:00:00Z`);

  // Fetch Recent Sessions
  const { data: recentSessions } = await supabase
    .from('sessions')
    .select('id, class_name, instructor_name, created_at, attendance(count)')
    .order('created_at', { ascending: false })
    .limit(5);

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
    { name: "Absent Today", stat: absentToday?.toString() || "0", icon: UserMinus, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" },
    { name: "Weekly Attendance Rate", stat: `${attendanceRate}%`, icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto dark:bg-gray-950 transition-colors duration-300 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-gray-900 dark:text-white">Dashboard Overview</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Monitor live attendance and system status.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((item) => (
          <div
            key={item.name}
            className="relative overflow-hidden rounded-xl bg-white dark:bg-gray-900 px-6 py-8 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center transition-colors duration-300"
          >
            <div className={`p-4 rounded-full ${item.bg} mr-4`}>
              <item.icon className={`h-8 w-8 ${item.color}`} aria-hidden="true" />
            </div>
            <div>
              <p className="truncate text-sm font-medium text-gray-500 dark:text-gray-400">{item.name}</p>
              <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">{item.stat}</p>
            </div>
          </div>
        ))}
      </div>

      <AttendanceChart data={chartData} totalPresent={totalPresentCount} totalAbsent={totalAbsentCount} />

      <div className="bg-white dark:bg-gray-900 shadow-sm border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden transition-colors duration-300">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center">
          <CalendarDays className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Recent Class Sessions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date & Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Subject & Lecture Hall</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Topic Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Attendance Count</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Report</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {recentSessions && recentSessions.length > 0 ? recentSessions.map((session: any) => {
                // Supabase returns count inside an array for one-to-many relationships when queried like attendance(count)
                const attendanceCount = (session.attendance as any)?.[0]?.count || 0;
                
                return (
                  <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(session.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {session.class_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {session.instructor_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${attendanceCount > 0 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}`}>
                        {attendanceCount} Present
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <DownloadReportButton sessionId={session.id} sessionName={session.class_name} />
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
  );
}
