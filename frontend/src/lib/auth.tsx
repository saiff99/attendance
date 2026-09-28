"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export interface AuthUser {
  username: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => ({ success: false }),
  logout: () => {},
});

const AUTH_STORAGE_KEY = "medattend_admin_session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Restore persistent session from localStorage on mount
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.username) {
          setUser(parsed);
          document.cookie = "medattend_auth=true; path=/; max-age=2592000; SameSite=Lax";
        }
      }
    } catch (e) {
      console.error("Failed to restore auth state", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (usernameInput: string, passwordInput: string): Promise<{ success: boolean; error?: string }> => {
    const cleanUser = usernameInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    // Valid credentials:
    // 1. admin / admin123
    // 2. admin / admin
    // 3. saif / saif123
    const isValid = 
      (cleanUser === "admin" && (cleanPass === "admin123" || cleanPass === "admin")) ||
      (cleanUser === "saif" && (cleanPass === "saif123" || cleanPass === "admin" || cleanPass === "admin123")) ||
      (cleanUser === "faculty" && cleanPass === "faculty123");

    if (!isValid) {
      return {
        success: false,
        error: "Invalid username or password. Please check your credentials.",
      };
    }

    const authUser: AuthUser = {
      username: cleanUser,
      name: cleanUser === "saif" ? "Sk. Saifuddin" : "Administrator",
      role: "Super Admin",
    };

    setUser(authUser);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
    document.cookie = "medattend_auth=true; path=/; max-age=2592000; SameSite=Lax";

    return { success: true };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    document.cookie = "medattend_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
