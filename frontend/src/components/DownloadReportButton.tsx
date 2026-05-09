"use client";

import { useState } from "react";
import { DownloadCloud, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function DownloadReportButton({ sessionId, sessionName }: { sessionId: string, sessionName: string }) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // Fetch attendance records for this session
      const { data, error } = await supabase
        .from('attendance')
        .select('recorded_at, status, confidence_score, students(student_roll, full_name, email)')
        .eq('session_id', sessionId)
        .order('recorded_at', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        alert("No attendance records found for this session.");
        setIsDownloading(false);
        return;
      }

      // Generate CSV content
      const headers = ["Roll Number", "Student Name", "Time Recorded", "Status", "Confidence Score (%)"];
      
      const csvRows = [headers.join(",")];
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.forEach((record: any) => {
        const roll = record.students?.student_roll || "N/A";
        // Escape commas in names
        const name = `"${record.students?.full_name || "Unknown"}"`;
        const time = new Date(record.recorded_at).toLocaleTimeString();
        const status = record.status;
        const confidence = Math.round(record.confidence_score * 100);
        
        csvRows.push([roll, name, time, status, confidence].join(","));
      });
      
      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      
      // Create a temporary link and trigger download
      const link = document.createElement("a");
      link.href = url;
      // Sanitize filename
      const safeName = sessionName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      link.setAttribute("download", `attendance_report_${safeName}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error("Error downloading report:", error);
      alert("Failed to download report.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={isDownloading}
      className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Download CSV Report"
    >
      {isDownloading ? (
        <Loader2 className="w-4 h-4 mr-1 animate-spin text-gray-400" />
      ) : (
        <DownloadCloud className="w-4 h-4 mr-1 text-gray-400" />
      )}
      Download
    </button>
  );
}
