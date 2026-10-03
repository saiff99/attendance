"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface ChartData {
  date: string;
  present: number;
  absent: number;
}

interface AttendanceChartProps {
  data: ChartData[];
  todayPresent: number;
  todayAbsent: number;
  totalStudents: number;
}

export function AttendanceChart({ data, todayPresent, todayAbsent, totalStudents }: AttendanceChartProps) {
  const pieData = [
    { name: 'Present', value: todayPresent, color: '#10b981' },
    { name: 'Absent', value: todayAbsent, color: '#ef4444' },
  ];

  const total = todayPresent + todayAbsent;
  const presentRate = total > 0 ? Math.round((todayPresent / total) * 100) : 0;
  const absentRate = total > 0 ? Math.round((todayAbsent / total) * 100) : 0;

  // Custom tooltip for 7-Day Trend Bar Chart
  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const present = payload.find((p: any) => p.dataKey === 'present')?.value || 0;
      const absent = payload.find((p: any) => p.dataKey === 'absent')?.value || 0;
      const totalDay = present + absent;
      const rate = totalDay > 0 ? Math.round((present / totalDay) * 100) : 0;
      return (
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-2xl text-xs space-y-1.5 pointer-events-none select-none min-w-[130px]">
          <div className="font-bold text-white text-xs border-b border-slate-800 pb-1 flex items-center justify-between gap-4">
            <span>{label}</span>
            <span className="text-[10px] text-emerald-400 font-semibold">{rate}% Present</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Present:</span>
            </span>
            <span className="font-bold text-emerald-400">{present}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Absent:</span>
            </span>
            <span className="font-bold text-rose-400">{absent}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for Pie Chart showing percentage and count
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const entry = payload[0];
      const isPresent = entry.name === 'Present';
      const pct = isPresent ? presentRate : absentRate;
      return (
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-2xl text-xs pointer-events-none select-none">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2.5 h-2.5 rounded-full ${isPresent ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="font-semibold text-white text-sm">{entry.name} Today</span>
          </div>
          <p className="text-gray-300 font-medium">
            <span className="text-white font-bold">{entry.value}</span> student{entry.value !== 1 ? 's' : ''} ({pct}%)
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {isPresent ? `${entry.value} of ${total} attended today` : `${entry.value} of ${total} not attended`}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 min-w-0 w-full select-none outline-none focus:outline-none">
      {/* 7-Day Trend Chart */}
      <div 
        tabIndex={-1}
        className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6 min-w-0 w-full outline-none focus:outline-none focus-visible:outline-none select-none"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Attendance Trends (Last 7 Days)</h3>
        <div className="h-72 w-full min-w-0 outline-none focus:outline-none">
          <ResponsiveContainer width="99%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.2} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip 
                cursor={{ fill: 'rgba(107, 114, 128, 0.1)' }}
                content={<CustomBarTooltip />}
              />
              <Legend wrapperStyle={{ paddingTop: '20px', outline: 'none' }} />
              <Bar dataKey="present" name="Present" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="absent" name="Absent" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Today's Overall Distribution Donut Chart */}
      <div 
        tabIndex={-1}
        className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6 min-w-0 w-full flex flex-col justify-between outline-none focus:outline-none focus-visible:outline-none select-none"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Overall Distribution</h3>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
            Today
          </span>
        </div>
        
        <div className="h-64 w-full min-w-0 relative flex items-center justify-center outline-none focus:outline-none">
          <ResponsiveContainer width="99%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={82}
                paddingAngle={4}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomPieTooltip />} />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                formatter={(value: string) => {
                  const isPres = value === 'Present';
                  const val = isPres ? todayPresent : todayAbsent;
                  const pct = isPres ? presentRate : absentRate;
                  return (
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                      {value}: <span className="font-bold">{val}</span> ({pct}%)
                    </span>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Center ratio / percentage label inside Donut */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6 select-none">
            <span className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
              {presentRate}%
            </span>
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-1">
              Present Today
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
