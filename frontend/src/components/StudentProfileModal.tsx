"use client";

import { useEffect, useState } from "react";
import { X, Calendar as CalendarIcon, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface StudentProfileModalProps {
  student: any;
  isOpen: boolean;
  onClose: () => void;
}

export function StudentProfileModal({ student, isOpen, onClose }: StudentProfileModalProps) {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && student?.id) {
      setLoading(true);
      const fetchAttendance = async () => {
        const { data } = await supabase
          .from("attendance")
          .select("*, sessions(class_name, date)")
          .eq("student_id", student.id)
          .order("recorded_at", { ascending: false });
        
        setAttendance(data || []);
        setLoading(false);
      };
      fetchAttendance();
    }
  }, [isOpen, student]);

  if (!isOpen || !student) return null;

  const totalSessions = attendance.length;
  const presentCount = attendance.filter((a) => a.status === "Present").length;
  const attendanceRate = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-end overflow-hidden pointer-events-auto">
      <div className="fixed inset-0 bg-gray-900/40 dark:bg-gray-950/80 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative w-full max-w-md h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col transform transition-transform duration-300 border-l border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-xl font-serif font-bold text-gray-900 dark:text-white">Student Profile</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-24 h-24 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4 text-3xl font-bold text-indigo-600 dark:text-indigo-400 border-4 border-white dark:border-gray-900 shadow-sm">
              {student.full_name.charAt(0)}
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{student.full_name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Roll No: {student.student_roll}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{student.email}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800 text-center">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Attendance Rate</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{attendanceRate}%</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800 text-center">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Classes</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalSessions}</p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center">
              <CalendarIcon className="w-4 h-4 mr-2" />
              Attendance History
            </h4>
            
            {loading ? (
              <div className="flex justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400"></div>
              </div>
            ) : attendance.length > 0 ? (
              <div className="space-y-3">
                {attendance.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{record.sessions?.class_name || 'Manual Session'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(record.recorded_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    {record.status === 'Present' ? (
                      <span className="inline-flex items-center text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Present
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs font-medium text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2.5 py-1 rounded-full">
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        Absent
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No attendance records found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
