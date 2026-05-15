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
      className={`${inter.variable} ${playfair.variable} min-h-screen bg-gray-50 dark:bg-gray-950 antialiased`}
    >
      <body suppressHydrationWarning className="min-h-screen flex transition-colors duration-300">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Sidebar />
          <main className="flex-1 md:ml-64 pt-16 md:pt-0 min-h-screen flex flex-col">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
