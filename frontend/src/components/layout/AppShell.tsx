"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "./Sidebar";
import { useAuth } from "@/lib/auth";
import { Activity, Loader2, ArrowRight } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [hasLiveSession, setHasLiveSession] = useState(false);
  const [liveSessionTitle, setLiveSessionTitle] = useState("");

  const isStudentPortal = pathname?.startsWith("/selfieattend") || pathname?.startsWith("/self-attendance");
  const isLoginPage = pathname === "/login";
  const isPublicRoute = isStudentPortal || isLoginPage;

  // Check for active Live Scan session
  useEffect(() => {
    const checkActiveSession = () => {
      if (typeof window !== "undefined") {
        const activeId = localStorage.getItem("medattend_active_session_id");
        const activeTitle = localStorage.getItem("medattend_active_session_title");
        setHasLiveSession(!!activeId);
        setLiveSessionTitle(activeTitle || "");
      }
    };

    checkActiveSession();
    window.addEventListener("medattend-session-changed", checkActiveSession);
    window.addEventListener("storage", checkActiveSession);
    const interval = setInterval(checkActiveSession, 3000);

    return () => {
      window.removeEventListener("medattend-session-changed", checkActiveSession);
      window.removeEventListener("storage", checkActiveSession);
      clearInterval(interval);
    };
  }, []);

  // Protect Admin Routes: If unauthenticated and accessing a private route, redirect to /login
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicRoute) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, isPublicRoute, router]);

  // Login page layout: Full screen without sidebar
  if (isLoginPage) {
    return (
      <main className="flex-1 min-h-screen flex flex-col w-full min-w-0 bg-[#070B12]">
        {children}
      </main>
    );
  }

  // Student Selfie Portal (/selfieattend):
  // - Publicly accessible for students without requiring login.
  // - Shows sidebar on desktop ONLY if Admin is logged in.
  if (isStudentPortal) {
    return (
      <>
        {isAuthenticated && <Sidebar />}
        <main className={`flex-1 min-h-screen flex flex-col w-full min-w-0 ${
          isAuthenticated ? "lg:pl-64" : "lg:pl-0"
        } pt-0 bg-[#070B12]`}>
          {children}
        </main>
      </>
    );
  }

  // Protected Admin Routes (/ , /live-scan, /students, /reports)
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#070B12] flex flex-col items-center justify-center p-4 text-center select-none">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-500/10 mb-4 animate-pulse">
          <Activity className="w-7 h-7" />
        </div>
        <div className="flex items-center gap-2.5 text-indigo-400 mb-1.5">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-semibold tracking-wide text-slate-200">Verifying Admin Session...</span>
        </div>
        <p className="text-xs text-slate-500">Connecting to MedAttend secure workspace</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 bg-[#070B12] flex flex-col items-center justify-center p-4 text-center select-none">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-500/10 mb-4 animate-pulse">
          <Activity className="w-7 h-7" />
        </div>
        <div className="flex items-center gap-2.5 text-indigo-400 mb-1.5">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-semibold tracking-wide text-slate-200">Redirecting to Admin Login...</span>
        </div>
        <p className="text-xs text-slate-500">Please wait while authentication portal loads</p>
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 lg:pl-64 pt-16 lg:pt-0 min-h-screen flex flex-col w-full min-w-0">
        {/* Global Live Session Banner when browsing other tabs */}
        {hasLiveSession && pathname !== "/live-scan" && (
          <div className="bg-gradient-to-r from-rose-600 via-indigo-600 to-violet-600 text-white px-4 py-2 sm:py-2.5 text-xs font-medium flex items-center justify-between shadow-md z-30 transition-all sticky top-16 lg:top-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-400"></span>
              </span>
              <span className="truncate">
                <strong className="uppercase font-bold tracking-wider mr-1.5 text-rose-100">Live Session Running:</strong>
                <span className="text-white font-semibold">{liveSessionTitle || "Attendance in progress"}</span>
              </span>
            </div>
            <Link
              href="/live-scan"
              className="ml-3 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold backdrop-blur-sm border border-white/25 flex items-center gap-1.5 shrink-0 transition-all shadow-sm"
            >
              <span>Return to Live Hub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
        {children}
      </main>
    </>
  );
}
