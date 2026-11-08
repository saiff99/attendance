"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ScanLine, Radio, Users, FileBarChart, Activity,
  Menu, X, Smartphone, LogOut, ShieldCheck, UserCog,
  GraduationCap, BookOpen, Database
} from "lucide-react";
import { SystemHealth } from "@/components/SystemHealth";
import { useAuth } from "@/lib/auth";
import { decodeSessionMetadata } from "@/lib/geofence";

declare global {
  interface Window {
    __toggleMedAttendSidebar?: (force?: boolean) => void;
  }
}

interface SidebarNavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  superAdminOnly?: boolean;
}

const navigation: SidebarNavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Live Scan", href: "/live-scan", icon: ScanLine },
  { name: "Ongoing", href: "/ongoing", icon: Radio },
  { name: "Student Directory", href: "/students", icon: Users },
  { name: "All Sessions", href: "/selfieattend", icon: Smartphone },
  { name: "Reports", href: "/reports", icon: FileBarChart },
  { name: "Faculty & Staff", href: "/users", icon: UserCog, superAdminOnly: true },
  { name: "Academic Subjects", href: "/subjects", icon: BookOpen, superAdminOnly: true },
  { name: "Audit Trail", href: "/audit-logs", icon: ShieldCheck, superAdminOnly: true },
  { name: "Database Backup", href: "/backup", icon: Database, superAdminOnly: true },
];

const studentNavigation: SidebarNavItem[] = [
  { name: "My Attendance Portal", href: "/portal", icon: GraduationCap },
  { name: "Selfie Attendance", href: "/selfieattend", icon: Smartphone },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [ongoingCount, setOngoingCount] = useState<number>(0);
  const { user, logout } = useAuth();
  const isStudentPortal = pathname?.startsWith("/selfieattend") || pathname?.startsWith("/self-attendance") || pathname?.startsWith("/portal");

  // Guarantee sidebar is cleanly closed on genuine route changes (skips initial mount)
  const initialPathRef = useRef(pathname);
  useEffect(() => {
    if (initialPathRef.current !== pathname) {
      initialPathRef.current = pathname;
      setIsOpen(false);
      if (typeof window !== "undefined" && window.__toggleMedAttendSidebar) {
        window.__toggleMedAttendSidebar(false);
      }
    }
  }, [pathname]);

  // Synchronize React state with native pre-hydration sidebar triggers
  useEffect(() => {
    const sb = document.getElementById("medattend-sidebar");
    if (sb && (sb.classList.contains("translate-x-0") || sb.getAttribute("data-open") === "true")) {
      const schedule = typeof queueMicrotask === "function" ? queueMicrotask : (fn: () => void) => setTimeout(fn, 0);
      schedule(() => setIsOpen(true));
    }

    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ open?: boolean }>;
      if (typeof customEvent.detail?.open === "boolean") {
        setIsOpen(customEvent.detail.open);
      }
    };
    window.addEventListener("medattend-sidebar-sync", handleSync);
    return () => {
      window.removeEventListener("medattend-sidebar-sync", handleSync);
    };
  }, []);

  useEffect(() => {
    const checkActive = async () => {
      if (typeof window !== "undefined") {
        // Efficiency & Battery Shield: Do not poll when the tab/window is hidden or minimized
        if (typeof document !== "undefined" && document.visibilityState !== "visible") {
          return;
        }

        try {
          const res = await fetch("/api/active-sessions", {
            headers: { "ngrok-skip-browser-warning": "69420" },
            cache: "no-store"
          });
          if (res.ok) {
            const data = await res.json();
            let activeList = (data.sessions || []).filter((s: { is_expired?: boolean; remaining_seconds?: number }) => !s.is_expired && (s.remaining_seconds ?? 0) > 0);
            if (user?.role === "Faculty") {
              const u = (user.username || "").toLowerCase();
              const n = (user.name || "").toLowerCase();
              activeList = activeList.filter((s: { instructor_name?: string; created_by?: string }) => {
                const cb = (s.created_by || "").toLowerCase();
                const dec = decodeSessionMetadata(s.instructor_name || "");
                const byTag = (dec.facultyUsername || "").toLowerCase();
                const topic = (dec.topic || "").toLowerCase();
                return (byTag && (byTag === u || byTag === n)) || (cb && (cb === u || cb === n)) || (topic && (topic === u || topic === n));
              });
            }
            setOngoingCount(activeList.length);
          }
        } catch {
          // silent fallback
        }
      }
    };

    // Initial check on mount
    checkActive();

    // Instant Wakeup: when user returns or focuses back on this tab, refresh immediately
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        checkActive();
      }
    };

    window.addEventListener("medattend-session-changed", checkActive);
    window.addEventListener("storage", checkActive);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Optimized adaptive interval: 12 seconds instead of aggressive 3s
    // (Session creation/destruction triggers immediate 0ms sync via events above)
    const interval = setInterval(checkActive, 12000);

    return () => {
      window.removeEventListener("medattend-session-changed", checkActive);
      window.removeEventListener("storage", checkActive);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [user?.role, user?.username, user?.name]);

  return (
    <>
      {/* Mobile & Tablet Top Header: Hidden on student portal routes (/selfieattend) */}
      {!isStudentPortal && (
        <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 sm:px-6 z-45 shadow-sm transition-colors duration-300 select-none">
          <div className="flex items-center">
            <Activity className="h-7 w-7 text-indigo-600 dark:text-indigo-400 mr-2.5" />
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              MedAttend
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              id="mobile-sidebar-toggle"
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.__toggleMedAttendSidebar) {
                  window.__toggleMedAttendSidebar();
                } else {
                  setIsOpen((prev) => !prev);
                }
              }}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800 [@media(hover:hover)]:hover:bg-gray-100 dark:[@media(hover:hover)]:hover:bg-gray-800 focus:outline-none transition-colors touch-manipulation cursor-pointer select-none"
              aria-label="Toggle sidebar"
              aria-expanded={isOpen}
            >
              <span className="sr-only">Toggle sidebar</span>
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Mobile & Tablet Backdrop Overlay */}
      {!isStudentPortal && (
        <div 
          id="medattend-sidebar-backdrop"
          className={classNames(
            "lg:hidden fixed inset-0 bg-black/60 z-40 transition-opacity backdrop-blur-sm",
            isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none hidden"
          )}
          onClick={() => {
            if (typeof window !== "undefined" && window.__toggleMedAttendSidebar) {
              window.__toggleMedAttendSidebar(false);
            } else {
              setIsOpen(false);
            }
          }}
          aria-hidden="true"
        />
      )}

      {/* Sidebar (Desktop: Always visible. Mobile: Hidden on student portal, slides in via isOpen on admin pages) */}
      <div 
        id="medattend-sidebar"
        data-open={isOpen ? "true" : "false"}
        className={classNames(
          "h-full w-64 sm:w-72 lg:w-64 flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-xl lg:shadow-sm fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out",
          isStudentPortal ? "hidden lg:flex" : "flex",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center">
            <Activity className="h-8 w-8 text-indigo-600 dark:text-indigo-400 mr-2" />
            <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              MedAttend
            </span>
          </div>
          <button 
            id="mobile-sidebar-close"
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.__toggleMedAttendSidebar) {
                window.__toggleMedAttendSidebar(false);
              } else {
                setIsOpen(false);
              }
            }}
            className="lg:hidden p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-gray-400 active:bg-gray-100 dark:active:bg-gray-800 [@media(hover:hover)]:hover:bg-gray-100 dark:[@media(hover:hover)]:hover:bg-gray-800 transition-colors touch-manipulation cursor-pointer select-none"
            aria-label="Close sidebar"
          >
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {(user?.role === "Student"
            ? studentNavigation
            : navigation.filter((item: SidebarNavItem) => {
                if (
                  item.superAdminOnly &&
                  user?.role !== "Super Admin" &&
                  !((item.href === "/users" || item.href === "/subjects") && user?.role === "Admin")
                ) {
                  return false;
                }
                if (
                  user?.role === "Faculty" &&
                  (item.href === "/students" ||
                    item.href === "/reports" ||
                    item.href === "/users" ||
                    item.href === "/subjects" ||
                    item.href === "/backup" ||
                    item.href === "/audit-logs")
                ) {
                  return false;
                }
                return true;
              })
          ).map((item) => {
            const isActive = pathname === item.href;
            const isOngoing = item.href === "/ongoing";
            const isPrimary = item.href === "/" || item.href === "/ongoing" || item.href === "/portal";
            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={isPrimary ? undefined : false}
                onMouseEnter={() => {
                  if (!isPrimary) {
                    router.prefetch(item.href);
                  }
                }}
                className={classNames(
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-400",
                  "group flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors"
                )}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("medattend-navigate"));
                    if (window.__toggleMedAttendSidebar) {
                      window.__toggleMedAttendSidebar(false);
                    }
                  }
                  setIsOpen(false);
                }}
              >
                <item.icon
                  className={classNames(
                    isActive ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-gray-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400",
                    "mr-3 h-5 w-5 flex-shrink-0 transition-colors"
                  )}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">
                  {item.href === "/users" && user?.role === "Admin" ? "Faculty Directory" : item.name}
                </span>
                {isOngoing && ongoingCount > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse shadow-sm shadow-rose-500/50 shrink-0 ml-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-white mr-1" />
                    {ongoingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex flex-col shrink-0 border-t border-gray-200 dark:border-gray-800 p-4 gap-3">
        <SystemHealth />

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center min-w-0">
            <div className={classNames(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
              user?.role === "Faculty"
                ? "bg-emerald-100 dark:bg-emerald-950/50 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                : "bg-indigo-100 dark:bg-indigo-900/50 border-indigo-500/20 text-indigo-700 dark:text-indigo-300"
            )}>
              <span className="text-xs font-bold leading-none tracking-wider">
                {(() => {
                  let identifier = user?.name || user?.username || "Faculty";
                  identifier = identifier.trim().replace(/^@/, "");
                  const parts = identifier.split(/[\s._-]+/).filter(Boolean);
                  if (parts.length >= 2 && parts[0][0] && parts[1][0]) {
                    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
                  }
                  return identifier.substring(0, 2).toUpperCase();
                })()}
              </span>
            </div>
            <div className="ml-3 min-w-0">
              <p 
                className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate"
                title={user?.name ? `${user.name} (@${user?.username})` : (user?.username ? `@${user.username}` : "Faculty")}
              >
                {user?.name || (user?.username ? `@${user.username}` : "Faculty")}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                <span className={classNames(
                  "inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md shrink-0",
                  user?.role === "Faculty"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                )}>
                  {user?.role || "User"}
                </span>
              </div>
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
