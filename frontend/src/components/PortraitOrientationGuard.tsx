"use client";

import React, { useEffect, useState } from "react";
import { Smartphone, RotateCcw, Lock } from "lucide-react";

/**
 * 📱 PortraitOrientationGuard
 * Ensures MedAttend mobile web app stays strictly in vertical Portrait orientation.
 * 
 * Behavior:
 * 1. Automatically attempts native Screen Orientation API lock (portrait-primary).
 * 2. When a mobile/touch device is turned horizontally into landscape mode (height <= 520px),
 *    displays an ultra-sleek, animated instruction overlay prompting the user to rotate their phone.
 * 3. Never triggers on desktops, laptops, or large-screen tablets.
 */
export function PortraitOrientationGuard() {
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false);

  useEffect(() => {
    // 1. Attempt Screen Orientation Lock API on mount
    const tryLockOrientation = async () => {
      if (typeof window !== "undefined" && "screen" in window && "orientation" in window.screen) {
        try {
          const orientationObj = window.screen.orientation as any;
          if (typeof orientationObj.lock === "function") {
            await orientationObj.lock("portrait-primary").catch(() => {
              orientationObj.lock("portrait").catch(() => {});
            });
          }
        } catch {
          // Ignored on standard Safari/Chrome browser tabs where lock requires PWA or fullscreen
        }
      }
    };

    tryLockOrientation();

    // 2. Responsive detection for mobile landscape
    const checkOrientation = () => {
      if (typeof window === "undefined") return;

      const width = window.innerWidth;
      const height = window.innerHeight;
      const isTouch =
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia("(hover: none) and (pointer: coarse)").matches;

      // Mobile phone in landscape: height is cramped (<= 520px) and width > height on touch devices
      const isMobileLandscape = isTouch && width > height && height <= 520;
      setIsLandscapeMobile(isMobileLandscape);
    };

    checkOrientation();

    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-[#060911]/98 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center select-none transition-all duration-300 portrait-guard-overlay ${
        isLandscapeMobile ? "opacity-100 pointer-events-auto flex" : "opacity-0 pointer-events-none hidden"
      }`}
      aria-hidden={!isLandscapeMobile}
    >
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-gradient-to-tr from-indigo-600/25 via-violet-600/20 to-teal-500/15 rounded-full blur-[90px] pointer-events-none" />

      {/* Rotating Phone Graphic */}
      <div className="relative w-24 h-24 mb-4 flex items-center justify-center relative z-10">
        <div className="absolute inset-0 rounded-full bg-indigo-500/10 border border-indigo-500/20 animate-pulse" />
        <div className="animate-phone-rotate text-indigo-400">
          <Smartphone className="w-14 h-14 drop-shadow-[0_4px_12px_rgba(99,102,241,0.5)]" />
        </div>
        <div className="absolute -top-1.5 -right-1.5 text-teal-400 animate-spin" style={{ animationDuration: "4s" }}>
          <RotateCcw className="w-5 h-5 drop-shadow-[0_2px_8px_rgba(45,212,191,0.6)]" />
        </div>
      </div>

      {/* Message and instruction badge */}
      <div className="relative z-10 max-w-sm flex flex-col items-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[11px] font-mono font-bold uppercase tracking-wider mb-2.5">
          <Lock className="w-3 h-3 text-indigo-400" />
          <span>Portrait Mode Required</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-1.5">
          Please Rotate Your Device
        </h2>

        <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
          MedAttend is optimized exclusively in vertical portrait view for biometric attendance and security.
        </p>

        <p className="text-[11px] text-indigo-400 font-semibold mt-2">
          মোবাইলটি সোজা করে ধরুন (Portrait Mode)
        </p>
      </div>
    </div>
  );
}
