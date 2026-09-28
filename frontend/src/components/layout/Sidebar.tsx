"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ScanLine, Users, FileBarChart, Activity, Menu, X, Smartphone, LogOut } from "lucide-react";
import { SystemHealth } from "@/components/SystemHealth";
import { useAuth } from "@/lib/auth";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Live Scan", href: "/live-scan", icon: ScanLine },
  { name: "Student Directory", href: "/students", icon: Users },
  { name: "Selfie Portal", href: "/selfieattend", icon: Smartphone },
  { name: "Reports", href: "/reports", icon: FileBarChart },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();
  const isStudentPortal = pathname?.startsWith("/selfieattend") || pathname?.startsWith("/self-attendance");

  return (
    <>
      {/* Mobile & Tablet Top Header: Hidden on student portal routes (/selfieattend) */}
      {!isStudentPortal && (
        <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 sm:px-6 z-40 shadow-sm transition-colors duration-300">
          <div className="flex items-center">
            <Activity className="h-7 w-7 text-indigo-600 dark:text-indigo-400 mr-2.5" />
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              MedAttend
            </span>
          </div>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 -mr-2 rounded-xl text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none transition-all"
          >
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Mobile & Tablet Backdrop Overlay */}
      {!isStudentPortal && isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 z-40 transition-opacity backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar (Desktop: Always visible. Mobile: Hidden on student portal, slides in via isOpen on admin pages) */}
      <div className={classNames(
        "h-full w-64 sm:w-72 lg:w-64 flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-xl lg:shadow-sm fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out",
        isStudentPortal ? "hidden lg:flex" : "flex",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
      <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center">
          <Activity className="h-8 w-8 text-indigo-600 dark:text-indigo-400 mr-2" />
          <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            MedAttend
          </span>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="lg:hidden -mr-2 p-2 rounded-lg text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={classNames(
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-400",
                  "group flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors"
                )}
                  onClick={() => setIsOpen(false)}
                >
                  <item.icon
                    className={classNames(
                      isActive ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-gray-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400",
                      "mr-3 h-5 w-5 flex-shrink-0 transition-colors"
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex flex-col shrink-0 border-t border-gray-200 dark:border-gray-800 p-4 gap-4">
        <SystemHealth />
        <div className="flex items-center justify-between">
          <div className="flex items-center min-w-0">
            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-500/20">
              <span className="text-xs font-bold leading-none text-indigo-700 dark:text-indigo-300 tracking-wider">
                {(() => {
                  const displayName = user?.name || "SK SAIFUDDIN";
                  const parts = displayName.trim().split(/\s+/);
                  return parts.length >= 2 
                    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() 
                    : displayName.substring(0, 2).toUpperCase();
                })()}
              </span>
            </div>
            <div className="ml-3 min-w-0">
              <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{user?.name || "SK SAIFUDDIN"}</p>
              <p className="text-xs font-medium text-indigo-500 dark:text-indigo-400">{user?.role || "Super Admin"}</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-2 rounded-xl text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer shrink-0"
            title="Log out of Admin Hub"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
