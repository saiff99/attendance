"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ScanLine, Users, FileBarChart, Activity, Menu, X } from "lucide-react";
import { SystemHealth } from "@/components/SystemHealth";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Live Scan", href: "/live-scan", icon: ScanLine },
  { name: "Student Directory", href: "/students", icon: Users },
  { name: "Reports", href: "/reports", icon: FileBarChart },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 z-40 shadow-sm transition-colors duration-300">
        <div className="flex items-center">
          <Activity className="h-7 w-7 text-indigo-600 dark:text-indigo-400 mr-2" />
          <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            MedAttend
          </span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 -mr-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white focus:outline-none"
        >
          <span className="sr-only">Open sidebar</span>
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar (Desktop & Mobile) */}
      <div className={classNames(
        "flex h-full w-64 flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-sm fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
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
          className="md:hidden -mr-2 p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
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
        <div className="flex items-center">
          <div>
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50">
              <span className="text-sm font-medium leading-none text-indigo-700 dark:text-indigo-300">Sk</span>
            </div>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900">Sk. Saifuddin</p>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700">Admin</p>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
