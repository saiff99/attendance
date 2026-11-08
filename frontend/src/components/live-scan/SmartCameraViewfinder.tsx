"use client";

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { Camera, RotateCcw, X } from "lucide-react";
import {
  analyzeFrameQuality,
  type QualityAssessment,
} from "@/lib/frameQuality";
import { toast } from "@/components/Toast";

export interface SmartCameraViewfinderProps {
  isOpen: boolean;
  queuedCount: number;
  onClose: () => void;
  onCapturePhoto: (
    file: File,
    options: {
      isPreOptimized: boolean;
      quality?: QualityAssessment;
      width: number;
      height: number;
    }
  ) => void;
  onFallbackSystemCamera?: () => void;
}

export const SmartCameraViewfinder = memo(function SmartCameraViewfinder({
  isOpen,
  queuedCount,
  onClose,
  onCapturePhoto,
  onFallbackSystemCamera,
}: SmartCameraViewfinderProps) {
  const [smartCameraFacing, setSmartCameraFacing] = useState<"environment" | "user">("environment");
  const [liveQuality, setLiveQuality] = useState<QualityAssessment | null>(null);
  const [cameraFlash, setCameraFlash] = useState(false);
  const smartVideoRef = useRef<HTMLVideoElement>(null);
  const smartStreamRef = useRef<MediaStream | null>(null);

  // Manage stream lifecycle when isOpen is toggled
  useEffect(() => {
    if (!isOpen) return;

    let isSubscribed = true;
    let qualityInterval: NodeJS.Timeout | null = null;
    const currentVideoEl = smartVideoRef.current;

    const initCamera = async () => {
      try {
        if (smartStreamRef.current) {
          smartStreamRef.current.getTracks().forEach((t) => t.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: smartCameraFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (!isSubscribed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        smartStreamRef.current = stream;
        if (smartVideoRef.current) {
          smartVideoRef.current.srcObject = stream;
          try {
            await smartVideoRef.current.play();
          } catch {}
        }

        // Real-time quality evaluation every 400ms
        qualityInterval = setInterval(() => {
          if (!isSubscribed) return;
          if (smartVideoRef.current && smartVideoRef.current.readyState >= 2) {
            const assessment = analyzeFrameQuality(smartVideoRef.current);
            if (assessment && isSubscribed) {
              setLiveQuality(assessment);
            }
          }
        }, 400);
      } catch (err) {
        console.warn("[Smart Camera] Failed to open in-app viewfinder:", err);
        toast.info("Opening standard camera...");
        if (isSubscribed) {
          onClose();
          onFallbackSystemCamera?.();
        }
      }
    };

    initCamera();

    return () => {
      isSubscribed = false;
      if (qualityInterval) clearInterval(qualityInterval);
      if (smartStreamRef.current) {
        smartStreamRef.current.getTracks().forEach((t) => t.stop());
        smartStreamRef.current = null;
      }
      if (currentVideoEl) {
        currentVideoEl.srcObject = null;
      }
    };
  }, [isOpen, smartCameraFacing, onClose, onFallbackSystemCamera]);

  const handleCapture = useCallback(() => {
    if (!smartVideoRef.current) return;
    const video = smartVideoRef.current;
    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Trigger visual shutter flash
    setCameraFlash(true);
    setTimeout(() => setCameraFlash(false), 120);

    ctx.drawImage(video, 0, 0, width, height);

    // Instantaneous snapshot quality assessment from live video HUD
    const capturedQuality = liveQuality ? { ...liveQuality } : undefined;

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File(
          [blob],
          `classroom-snap-${Date.now()}.jpg`,
          { type: "image/jpeg", lastModified: Date.now() }
        );
        onCapturePhoto(file, {
          isPreOptimized: true,
          quality: capturedQuality,
          width,
          height,
        });
      },
      "image/jpeg",
      0.92
    );
  }, [liveQuality, onCapturePhoto]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between overflow-hidden select-none">
      {/* Camera Video Stream */}
      <video
        ref={smartVideoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Shutter Flash Animation */}
      {cameraFlash && (
        <div className="absolute inset-0 bg-white/90 z-40 pointer-events-none transition-opacity duration-150" />
      )}

      {/* Top HUD: Real-time Quality Advisor & Controls */}
      <div className="relative z-30 pt-4 px-4 sm:pt-6 sm:px-6 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        {/* Quality Advisor Pill */}
        <div
          className={`px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-medium flex items-center gap-2 shadow-lg transition-all ${
            liveQuality
              ? liveQuality.status === "good"
                ? "bg-emerald-950/80 border-emerald-500/50 text-emerald-200"
                : liveQuality.status === "blurry"
                ? "bg-rose-950/80 border-rose-500/50 text-rose-200"
                : "bg-amber-950/80 border-amber-500/50 text-amber-200"
              : "bg-slate-900/80 border-slate-700 text-slate-300"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              liveQuality
                ? liveQuality.status === "good"
                  ? "bg-emerald-400"
                  : liveQuality.status === "blurry"
                  ? "bg-rose-400"
                  : "bg-amber-400"
                : "bg-indigo-400"
            } animate-pulse`}
          />
          <span className="truncate max-w-[200px] sm:max-w-none">
            {liveQuality ? liveQuality.message : "Calibrating lighting & focus..."}
          </span>
        </div>

        {/* Action Buttons: Flip Camera & Close */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setSmartCameraFacing((curr) =>
                curr === "environment" ? "user" : "environment"
              )
            }
            className="p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/80 backdrop-blur-md transition-all cursor-pointer shadow-md"
            title="Switch camera"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-full bg-slate-900/80 hover:bg-rose-900/80 text-white border border-slate-700/80 backdrop-blur-md transition-all cursor-pointer shadow-md"
            title="Close camera"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Framing Reticle Guide */}
      <div className="relative z-20 flex-1 flex flex-col items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-sm sm:max-w-md aspect-[16/10] border-2 border-dashed border-white/25 rounded-2xl relative flex items-center justify-center">
          {/* Corner Accents */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-indigo-400 rounded-tl" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-indigo-400 rounded-tr" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-indigo-400 rounded-bl" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-indigo-400 rounded-br" />

          <div className="px-3 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-[11px] text-white/80 font-medium text-center">
            Align student seating rows in frame
          </div>
        </div>
      </div>

      {/* Bottom Controls Bar: Shutter, Staged Counter, Done */}
      <div className="relative z-30 pb-8 pt-4 px-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col items-center gap-3">
        <p className="text-[11px] text-slate-300 font-medium drop-shadow text-center">
          Snap photos across the classroom. Pan left to right for complete coverage.
        </p>

        <div className="w-full max-w-md flex items-center justify-between gap-4">
          {/* Photos Staged Pill */}
          <div className="flex-1 text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700 text-xs font-semibold text-white backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{queuedCount} Staged</span>
            </div>
          </div>

          {/* Shutter Button */}
          <button
            type="button"
            onClick={handleCapture}
            className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-white/90 p-1 flex items-center justify-center active:scale-95 transition-transform cursor-pointer shadow-2xl hover:border-indigo-400"
            title="Capture photo"
          >
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
              <Camera className="w-7 h-7 text-indigo-950" />
            </div>
          </button>

          {/* Done & Review Button */}
          <div className="flex-1 text-right">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition-all cursor-pointer"
            >
              Done ({queuedCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
