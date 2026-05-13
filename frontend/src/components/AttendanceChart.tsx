"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface ChartData {
  date: string;
  present: number;
  absent: number;
}

interface AttendanceChartProps {
  data: ChartData[];
  totalPresent: number;
  totalAbsent: number;
}

export function AttendanceChart({ data, totalPresent, totalAbsent }: AttendanceChartProps) {
  const pieData = [
    { name: 'Present', value: totalPresent },
    { name: 'Absent', value: totalAbsent },
  ];
  const COLORS = ['#10b981', '#ef4444'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Attendance Trends (Last 7 Days)</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.2} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip 
                cursor={{ fill: 'rgba(107, 114, 128, 0.1)' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="present" name="Present" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="absent" name="Absent" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Overall Distribution</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
