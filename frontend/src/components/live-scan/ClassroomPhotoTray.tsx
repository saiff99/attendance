"use client";

import { memo } from "react";
import {
  ShieldCheck, AlertCircle, Loader2, Check, X,
  Plus, Upload, Trash2
} from "lucide-react";
import type { QueuedPhotoItem } from "./types";

export interface ClassroomPhotoTrayProps {
  queuedPhotos: QueuedPhotoItem[];
  isOnline: boolean;
  isProcessing: boolean;
  processingStatusText?: string;
  batchProgress?: { current: number; total: number } | null;
  onStartSmartCamera: () => void;
  onOpenGallery: () => void;
  onRemovePhoto: (id: string) => void;
  onClearPhotos: () => void;
}

export const ClassroomPhotoTray = memo(function ClassroomPhotoTray({
  queuedPhotos,
  isOnline,
  isProcessing,
  processingStatusText = "Analyzing image...",
  batchProgress,
  onStartSmartCamera,
  onOpenGallery,
  onRemovePhoto,
  onClearPhotos,
}: ClassroomPhotoTrayProps) {
  if (queuedPhotos.length === 0) return null;

  return (
    <div className="w-full max-w-full min-w-0 flex-1 flex flex-col bg-slate-950/90 rounded-2xl border border-slate-800 p-3 sm:p-5 box-border">
      {/* Tray Header Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-bold text-xs shadow-md shadow-indigo-600/30">
            {queuedPhotos.length}
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>{queuedPhotos.length} Photo{queuedPhotos.length > 1 ? "s" : ""} Staged</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Ready
              </span>
            </h4>
            <p className="text-[11px] text-slate-400">
              Review photos or snap additional angles before running AI attendance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
          <span className="text-slate-300 font-medium text-[10px] sm:text-[11px]">
            {isOnline ? "IndexedDB Staged" : "Offline (IndexedDB Staged)"}
          </span>
        </div>
      </div>

      {/* Thumbnail Carousel / Grid */}
      <div className="flex-1 overflow-y-auto py-3 min-h-[160px] sm:min-h-[220px]">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {queuedPhotos.map((item) => (
            <div
              key={item.id}
              className="group relative rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-md flex flex-col aspect-[4/3]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt={item.label}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

              {/* Real-time Quality Advisor Badge (ADR-050) */}
              {item.quality && (
                <div
                  className={`absolute top-2 left-2 px-1.5 py-0.5 rounded-md backdrop-blur-md text-[9px] font-bold shadow flex items-center gap-1 ${
                    item.quality.status === "good"
                      ? "bg-emerald-500/80 text-white"
                      : item.quality.status === "blurry"
                      ? "bg-rose-500/85 text-white"
                      : "bg-amber-500/85 text-white"
                  }`}
                  title={item.quality.message}
                >
                  {item.quality.status === "good" ? (
                    <>
                      <ShieldCheck className="w-2.5 h-2.5" />
                      <span>Clear</span>
                    </>
                  ) : item.quality.status === "blurry" ? (
                    <>
                      <AlertCircle className="w-2.5 h-2.5" />
                      <span>Blurry</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-2.5 h-2.5" />
                      <span>Low Light</span>
                    </>
                  )}
                </div>
              )}

              {/* Photo Label Badge */}
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-indigo-600/90 text-white font-bold text-[10px] shadow">
                {item.label}
              </div>

              {/* Eager Background Optimization Status Indicator */}
              {item.compressionStatus === "compressing" ? (
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-amber-500/80 backdrop-blur-sm text-white font-semibold text-[9px] shadow flex items-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  <span>Optimizing</span>
                </div>
              ) : item.compressionStatus === "ready" ? (
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-emerald-600/85 backdrop-blur-sm text-white font-semibold text-[9px] shadow flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" />
                  <span>Ready</span>
                </div>
              ) : null}

              {/* Delete Button */}
              {!isProcessing && (
                <button
                  type="button"
                  onClick={() => onRemovePhoto(item.id)}
                  className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 hover:bg-rose-600 text-white transition-all cursor-pointer shadow"
                  title="Delete this photo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Processing Status Banner & Progress */}
      {isProcessing && (
        <div className="pt-2 pb-1">
          <div className="flex items-center justify-between text-xs text-indigo-300 mb-1.5 font-medium">
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{processingStatusText}</span>
            </div>
            {batchProgress && (
              <span className="font-mono text-[11px] font-bold">
                {batchProgress.current} / {batchProgress.total}
              </span>
            )}
          </div>
          {batchProgress && (
            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300"
                style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Tray Bottom Controls (Snap Next Photo, Gallery, Clear) */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onStartSmartCamera}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Snap Next Photo</span>
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={onOpenGallery}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
            title="Add more photos from phone gallery"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="text-xs">Gallery</span>
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={onClearPhotos}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition-all cursor-pointer disabled:opacity-50"
            title="Clear all staged photos"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1 font-medium">
          <span>{queuedPhotos.length}</span>
          <span>{queuedPhotos.length === 1 ? "photo staged" : "photos staged"}</span>
        </div>
      </div>
    </div>
  );
});

