import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/lib/auth";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
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
  description: "Medical College Smart Attendance & Student Portal",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MedAttend",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#4f46e5",
  interactiveWidget: "resizes-content",
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
      className={`dark ${inter.variable} ${playfair.variable} min-h-screen bg-[#070B12] dark:bg-[#070B12] antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="screen-orientation" content="portrait" />
        <meta name="x5-orientation" content="portrait" />
        <meta name="orientation" content="portrait" />
        {/* Instant Mobile Sidebar Controller: Zero-latency pre-hydration and post-hydration bridge */}
        <script
          id="medattend-mobile-sidebar-init"
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  var isToggling = false;
  function toggleSidebar(forceState) {
    if (isToggling) return;
    isToggling = true;
    setTimeout(function() { isToggling = false; }, 120);

    var sb = document.getElementById('medattend-sidebar');
    var bd = document.getElementById('medattend-sidebar-backdrop');
    var btn = document.getElementById('mobile-sidebar-toggle');
    if (!sb) return;

    var isOpenNow = sb.classList.contains('translate-x-0');
    var willOpen = forceState !== undefined ? forceState : !isOpenNow;

    if (willOpen) {
      sb.classList.remove('-translate-x-full');
      sb.classList.add('translate-x-0');
      if (bd) {
        bd.classList.remove('hidden', 'pointer-events-none', 'opacity-0');
        bd.classList.add('opacity-100', 'pointer-events-auto');
        bd.style.display = 'block';
      }
      if (btn) btn.setAttribute('aria-expanded', 'true');
    } else {
      sb.classList.add('-translate-x-full');
      sb.classList.remove('translate-x-0');
      if (bd) {
        bd.classList.add('opacity-0', 'pointer-events-none');
        bd.classList.remove('opacity-100', 'pointer-events-auto');
        bd.style.display = 'none';
      }
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    try {
      window.dispatchEvent(new CustomEvent('medattend-sidebar-sync', { detail: { open: willOpen } }));
    } catch(e) {}
  }

  window.__toggleMedAttendSidebar = toggleSidebar;

  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!target) return;
    var toggleBtn = target.closest ? target.closest('#mobile-sidebar-toggle') : null;
    if (toggleBtn) {
      toggleSidebar();
      return;
    }
    var closeBtn = target.closest ? target.closest('#mobile-sidebar-close') : null;
    var backdrop = target.closest ? target.closest('#medattend-sidebar-backdrop') : null;
    if (closeBtn || backdrop) {
      toggleSidebar(false);
      return;
    }
  });
})();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning className="min-h-screen bg-[#070B12] dark:bg-[#070B12] text-slate-100 transition-colors duration-200 antialiased">
        <AuthProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
            <AppShell>{children}</AppShell>
            <PwaInstallPrompt />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
