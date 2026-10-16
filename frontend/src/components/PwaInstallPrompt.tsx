"use client";

import React, { useEffect, useState } from "react";
import { Download, Share2, PlusSquare, X, Check, Smartphone, Laptop } from "lucide-react";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  useEffect(() => {
    // 1. Check if running in standalone mode (already installed as PWA)
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://");

    if (isStandaloneMode) {
      setIsStandalone(true);
      return;
    }

    // Check if previously dismissed in last 2 days
    const dismissedTime = localStorage.getItem("medattend_pwa_dismissed");
    if (dismissedTime && Date.now() - parseInt(dismissedTime, 10) < 2 * 24 * 60 * 60 * 1000) {
      setIsDismissed(true);
      return;
    }

    // 2. Register Service Worker
    if ("serviceWorker" in navigator && process.env.NODE_ENV !== "development") {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("PWA Service Worker registered successfully:", reg.scope);
        })
        .catch((err) => {
          console.warn("PWA Service Worker registration failed:", err);
        });
    }

    // 3. Detect iOS and Mobile vs Desktop device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleIos =
      /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIos(isAppleIos);

    const isMobileDevice =
      /android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
      (navigator.maxTouchPoints > 1 && !/windows nt/i.test(userAgent) && /ipad|macintosh/i.test(userAgent));
    setIsMobile(Boolean(isMobileDevice));

    // 4. Android / Chrome beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // If iOS and not standalone, show prompt after 2 seconds
    if (isAppleIos) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 2500);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setIsDismissed(true);
    localStorage.setItem("medattend_pwa_dismissed", Date.now().toString());
  };

  // Do not render anything if already installed, dismissed, or not ready
  if (isStandalone || isDismissed || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/95 border border-indigo-500/40 p-4 shadow-2xl backdrop-blur-md text-white">
        {/* Subtle glowing ambient gradient */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-600 to-emerald-500 flex items-center justify-center shadow-md shadow-indigo-600/30 shrink-0">
              {isMobile ? (
                <Smartphone className="w-6 h-6 text-white" />
              ) : (
                <Laptop className="w-6 h-6 text-white" />
              )}
            </div>
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                Install MedAttend App
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                  Fast
                </span>
              </h4>
              <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                {isIos
                  ? "Install on your iPhone for full-screen attendance without browser bars!"
                  : isMobile
                  ? "Add to home screen for instant 1-tap attendance and alerts!"
                  : "Install on your desktop for instant 1-click attendance and alerts!"}
              </p>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Platform Specific Action */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 relative z-10">
          {isIos ? (
            /* iOS Safari Instructions */
            <div className="flex flex-col gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-xs">
              <div className="flex items-center gap-2 text-slate-200">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center text-[11px] shrink-0">
                  1
                </span>
                <span>
                  Tap the <strong className="text-white">Share</strong> icon{" "}
                  <Share2 className="w-3.5 h-3.5 inline text-indigo-400 -mt-0.5" /> at the bottom of Safari.
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-200">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center text-[11px] shrink-0">
                  2
                </span>
                <span>
                  Scroll down & select{" "}
                  <strong className="text-white">"Add to Home Screen"</strong>{" "}
                  <PlusSquare className="w-3.5 h-3.5 inline text-emerald-400 -mt-0.5" />.
                </span>
              </div>
              <button
                onClick={handleDismiss}
                className="mt-1 w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" /> Got It
              </button>
            </div>
          ) : (
            /* Android / Desktop Chrome Install Button */
            <div className="flex items-center gap-2">
              <button
                onClick={handleInstallClick}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isMobile ? "Install App on Phone" : "Install App on Desktop"}</span>
              </button>
              <button
                onClick={handleDismiss}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
              >
                Later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
