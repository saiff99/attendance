import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import Sidebar from "@/components/layout/Sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MedAttend - Smart Attendance System",
  description: "Medical College Smart Attendance System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="h-full bg-gray-50 dark:bg-gray-950 flex transition-colors duration-300">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Sidebar />
          <main className="flex-1 ml-64 min-h-screen">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
