"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { useAuth } from "@/lib/auth";
import { Activity, Loader2 } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const isStudentPortal = pathname?.startsWith("/selfieattend") || pathname?.startsWith("/self-attendance");
  const isLoginPage = pathname === "/login";
  const isPublicRoute = isStudentPortal || isLoginPage;

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
        {children}
      </main>
    </>
  );
}
