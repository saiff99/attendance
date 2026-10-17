"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Lock, User, ShieldCheck,
  AlertCircle, Eye, EyeOff, Loader2, CheckCircle2,
  GraduationCap, KeyRound
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const LOGIN_MODE_STORAGE_KEY = "medattend_login_mode";

export default function LoginPage() {
  const [loginMode, setLoginMode] = useState<"admin" | "student">("admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const { login, logout, isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  // Restore persisted login tab selection from URL parameter or localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const paramMode = urlParams.get("mode");
      if (paramMode === "student" || paramMode === "admin") {
        setLoginMode(paramMode);
        localStorage.setItem(LOGIN_MODE_STORAGE_KEY, paramMode);
        return;
      }
      const savedMode = localStorage.getItem(LOGIN_MODE_STORAGE_KEY);
      if (savedMode === "student" || savedMode === "admin") {
        setLoginMode(savedMode);
      }
    }
  }, []);

  const handleSwitchMode = (mode: "admin" | "student") => {
    setLoginMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem(LOGIN_MODE_STORAGE_KEY, mode);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const destination = user.role === "Student" ? "/portal" : "/";
      router.replace(destination);
    }
  }, [isAuthenticated, isLoading, user, router]);

  useEffect(() => {
    setError(null);
    setUsername("");
    setPassword("");
    // Only auto-focus on desktop with physical keyboard to prevent mobile soft-keyboard popups & layout jumping
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [loginMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(
        loginMode === "student"
          ? "Please enter your Student Roll Number and 6-digit PIN."
          : "Please enter both username and password."
      );
      return;
    }

    setLoading(true);
    setError(null);

    // Micro-delay for smooth perceptible feedback
    await new Promise((r) => setTimeout(r, 200));

    const res = await login(username, password, loginMode);

    if (res.success) {
      // Role safeguard: ensure authenticated user role matches current loginMode
      if (loginMode === "admin" && res.user?.role === "Student") {
        await logout();
        setLoading(false);
        setError('This account belongs to a Student. Please switch to the "Student Portal" tab to sign in.');
        return;
      }
      if (loginMode === "student" && res.user?.role !== "Student") {
        await logout();
        setLoading(false);
        setError('This is a Staff/Admin account. Please switch to the "Staff & Admin" tab to sign in.');
        return;
      }

      setIsSuccess(true);
      if (typeof window !== "undefined") {
        localStorage.setItem(LOGIN_MODE_STORAGE_KEY, loginMode);
      }
      const destination = res.user?.role === "Student" ? "/portal" : "/";
      router.replace(destination);
    } else {
      setLoading(false);
      setError(res.error || "Authentication failed. Please check your credentials.");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#070B12] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-10 right-10 w-72 h-72 bg-violet-600/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10 transition-all duration-300 ease-out overflow-hidden">
        {/* Animated Top Progress Line during loading */}
        {loading && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 via-violet-400 to-emerald-400 animate-pulse w-full" />
          </div>
        )}

        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white mb-3 shadow-xl shadow-indigo-600/30 transition-transform duration-300 hover:scale-105">
            {loginMode === "student" ? <GraduationCap className="w-7 h-7" /> : <Activity className="w-7 h-7" />}
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            MedAttend{" "}
            <span className={`text-xs uppercase font-bold px-2 py-0.5 rounded-full border ${
              loginMode === "student"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
            }`}>
              {loginMode === "student" ? "Student" : "Staff / Admin"}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {loginMode === "student"
              ? "Access Your Medical Curriculum & Attendance Portal"
              : "Faculty & Administrator Control Hub"}
          </p>
        </div>

        {/* Tab Switcher: Admin / Faculty vs Student Portal */}
        <div className="relative grid grid-cols-2 p-1 bg-slate-950/80 border border-slate-800 rounded-2xl mb-5 select-none">
          {/* Animated Sliding Pill Indicator */}
          <div
            className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-xl bg-indigo-600 shadow-md shadow-indigo-600/30 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none ${
              loginMode === "student" ? "translate-x-full" : "translate-x-0"
            }`}
          />

          <button
            type="button"
            onClick={() => handleSwitchMode("admin")}
            className={`relative z-10 py-2.5 px-3 rounded-xl text-xs font-bold transition-colors duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              loginMode === "admin"
                ? "text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <ShieldCheck className={`w-3.5 h-3.5 transition-transform duration-200 ${loginMode === "admin" ? "scale-105" : ""}`} />
            <span>Staff &amp; Admin</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchMode("student")}
            className={`relative z-10 py-2.5 px-3 rounded-xl text-xs font-bold transition-colors duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              loginMode === "student"
                ? "text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <GraduationCap className={`w-3.5 h-3.5 transition-transform duration-200 ${loginMode === "student" ? "scale-105" : ""}`} />
            <span>Student Portal</span>
          </button>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2 transition-all animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* User ID / Student Roll Field */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              {loginMode === "student" ? "Student Roll Number" : "Username"}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                {loginMode === "student" ? <GraduationCap className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <input
                ref={inputRef}
                type="text"
                required
                disabled={loading}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                placeholder={loginMode === "student" ? "e.g. 25003" : "e.g. admin or faculty"}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-base sm:text-sm font-medium transition-all duration-200 disabled:opacity-60"
              />
            </div>
          </div>

          {/* Password / 6-Digit PIN Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                {loginMode === "student" ? "6-Digit Security PIN" : "Password"}
              </label>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                {loginMode === "student" ? <KeyRound className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
                disabled={loading}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder={loginMode === "student" ? "Enter 6-digit PIN" : "Enter password"}
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-base sm:text-sm font-medium transition-all duration-200 disabled:opacity-60"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors cursor-pointer disabled:opacity-40"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {loginMode === "student" && (
              <p className="text-[11px] text-slate-500 mt-1.5">
                Enter your registered 6-digit Security PIN.
              </p>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] ${
                isSuccess
                  ? "bg-emerald-600 text-white shadow-emerald-600/30"
                  : loading
                  ? "bg-indigo-600/90 text-white shadow-indigo-600/30 animate-pulse"
                  : "bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:via-indigo-400 hover:to-violet-500 text-white shadow-indigo-600/30"
              }`}
            >
              {isSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-200 animate-bounce" />
                  <span>
                    {loginMode === "student" ? "Opening Student Portal..." : "Redirecting to Dashboard..."}
                  </span>
                </>
              ) : loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-200" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{loginMode === "student" ? "Sign In to Student Portal" : "Sign In to Admin Hub"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Footer */}
      <footer className="mt-6 text-center text-xs text-slate-500 z-10">
        MedAttend Smart Attendance System • Secured Role Access
      </footer>
    </div>
  );
}
