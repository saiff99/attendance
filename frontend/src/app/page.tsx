/* eslint-disable */
import { Users, UserCheck, UserMinus, Activity, CalendarDays } from "lucide-react";
import { supabase } from "@/lib/supabase";
import DownloadReportButton from "@/components/DownloadReportButton";

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

  const stats = [
    { name: "Total Students", stat: totalStudents?.toString() || "0", icon: Users, color: "text-blue-600", bg: "bg-blue-100" },
    { name: "Present Last Class", stat: lastClassPresent.toString(), icon: UserCheck, color: "text-green-600", bg: "bg-green-100" },
    { name: "Absent", stat: absentToday?.toString() || "0", icon: UserMinus, color: "text-red-600", bg: "bg-red-100" },
    { name: "System Status", stat: "Online", icon: Activity, color: "text-emerald-600", bg: "bg-emerald-100" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-gray-900">Dashboard Overview</h1>
        <p className="mt-1 text-sm text-gray-500">Monitor live attendance and system status.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((item) => (
          <div
            key={item.name}
            className="relative overflow-hidden rounded-xl bg-white px-6 py-8 shadow-sm border border-gray-100 flex items-center"
          >
            <div className={`p-4 rounded-full ${item.bg} mr-4`}>
              <item.icon className={`h-8 w-8 ${item.color}`} aria-hidden="true" />
            </div>
            <div>
              <p className="truncate text-sm font-medium text-gray-500">{item.name}</p>
              <p className="mt-1 text-3xl font-semibold text-gray-900">{item.stat}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white shadow-sm border border-gray-100 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center">
          <CalendarDays className="w-5 h-5 mr-2 text-indigo-600" />
          <h2 className="text-lg font-medium text-gray-900">Recent Class Sessions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject & Lecture Hall</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Topic Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attendance Count</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Report</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentSessions && recentSessions.length > 0 ? recentSessions.map((session: any) => {
                // Supabase returns count inside an array for one-to-many relationships when queried like attendance(count)
                const attendanceCount = (session.attendance as any)?.[0]?.count || 0;
                
                return (
                  <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(session.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {session.class_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {session.instructor_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${attendanceCount > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
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
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
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
