"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStudentPortal = pathname?.startsWith("/selfieattend") || pathname?.startsWith("/self-attendance");

  return (
    <>
      <Sidebar />
      <main className={`flex-1 min-h-screen flex flex-col w-full min-w-0 ${
        isStudentPortal 
          ? "lg:ml-64 pt-0 bg-[#070B12]" 
          : "lg:ml-64 pt-16 lg:pt-0"
      }`}>
        {children}
      </main>
    </>
  );
}
