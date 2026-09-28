"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

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
          isAuthenticated ? "lg:ml-64" : "lg:ml-0"
        } pt-0 bg-[#070B12]`}>
          {children}
        </main>
      </>
    );
  }

  // Protected Admin Routes (/ , /live-scan, /students, /reports)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070B12] flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className="text-xs">Verifying Admin Session...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#070B12] flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className="text-xs">Redirecting to Admin Login...</span>
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0 min-h-screen flex flex-col w-full min-w-0">
        {children}
      </main>
    </>
  );
}
