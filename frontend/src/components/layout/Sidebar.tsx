"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ScanLine, Users, FileBarChart, Activity } from "lucide-react";

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

  return (
    <div className="flex h-full w-64 flex-col bg-white border-r border-gray-200 shadow-sm fixed inset-y-0 z-50">
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-gray-100">
        <Activity className="h-8 w-8 text-indigo-600 mr-2" />
        <span className="font-serif text-2xl font-bold tracking-tight text-gray-900">
          MedAttend
        </span>
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
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
                  "group flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors"
                )}
              >
                <item.icon
                  className={classNames(
                    isActive ? "text-indigo-600" : "text-gray-400 group-hover:text-indigo-600",
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
      <div className="flex shrink-0 border-t border-gray-200 p-4">
        <div className="flex items-center">
          <div>
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100">
              <span className="text-sm font-medium leading-none text-indigo-700">Dr</span>
            </div>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Dr. Smith</p>
            <p className="text-xs font-medium text-gray-500 group-hover:text-gray-700">Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}
