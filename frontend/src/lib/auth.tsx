"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

export interface AuthUser {
  username: string;
  name: string;
  role: "Super Admin" | "Faculty" | "Student";
  department?: string;
  studentId?: string;
  studentRoll?: string;
  academicYear?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, pass: string, mode?: "admin" | "student") => Promise<{ success: boolean; error?: string; user?: AuthUser }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => ({ success: false }),
  logout: async () => {},
  refreshSession: async () => {},
});

const AUTH_STORAGE_KEY = "medattend_admin_session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user));
          return;
        }
      }
      
      // If server cookie is absent or expired, explicitly clear client auth state and storage
      setUser(null);
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to check auth status:", e);
      setUser(null);
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = async (
    usernameInput: string,
    passwordInput: string,
    mode?: "admin" | "student"
  ): Promise<{ success: boolean; error?: string; user?: AuthUser }> => {
    const cleanUser = usernameInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    try {
      // Secure server-side credential verification (no passwords in client bundle)
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: cleanUser,
          password: cleanPass,
          mode,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || "Invalid username or password. Please check your credentials.",
        };
      }

      const authUser: AuthUser = data.user;
      setUser(authUser);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));

      return { success: true, user: authUser };
    } catch (err: any) {
      return {
        success: false,
        error: "Server connection failed. Please try again.",
      };
    }
  };

  const logout = async () => {
    const roleBeforeLogout = user?.role;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors during logout
    }
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    if (typeof window !== "undefined") {
      if (roleBeforeLogout === "Student") {
        localStorage.setItem("medattend_login_mode", "student");
      } else if (roleBeforeLogout === "Super Admin" || roleBeforeLogout === "Faculty") {
        localStorage.setItem("medattend_login_mode", "admin");
      }
    }
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
