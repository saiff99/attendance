"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Activity, Lock, User, ArrowRight, ShieldCheck, 
  AlertCircle, Smartphone, Eye, EyeOff, Loader2 
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await login(username, password);
    setLoading(false);

    if (res.success) {
      router.push("/");
    } else {
      setError(res.error || "Authentication failed.");
    }
  };

  return (
    <div className="min-h-screen bg-[#070B12] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background Ambient Glow */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-10 right-10 w-72 h-72 bg-violet-600/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white mb-3.5 shadow-xl shadow-indigo-600/30">
            <Activity className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            MedAttend <span className="text-xs uppercase font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">Admin</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Faculty & Administrator Control Hub
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Admin Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. admin"
                autoFocus
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-medium transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="Enter admin password"
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-medium transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98 mt-2"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Verifying Credentials...</>
            ) : (
              <><ShieldCheck className="w-4 h-4" /> Access Admin Dashboard</>
            )}
          </button>
        </form>

        {/* Quick Demo Hint */}
        <div className="mt-4 p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 text-[11px] text-slate-400 text-center">
          <span>Default Admin Login: </span>
          <strong className="text-indigo-300 font-mono">admin</strong> / <strong className="text-indigo-300 font-mono">admin123</strong>
        </div>

        {/* Student Redirection Section */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col items-center text-center gap-2">
          <p className="text-xs text-slate-400">Are you a student attending class?</p>
          <Link
            href="/selfieattend"
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/70 text-emerald-300 hover:text-emerald-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span>Open Student Selfie Attendance Portal</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-6 text-center text-xs text-slate-500 z-10">
        MedAttend Smart Attendance System • Secured Role Access
      </footer>
    </div>
  );
}
