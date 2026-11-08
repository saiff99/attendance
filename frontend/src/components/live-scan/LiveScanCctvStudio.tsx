"use client";

import { useMemo, useEffect, useCallback, memo } from "react";
import {
  Grid, Video, Maximize2, Minimize2, ShieldCheck, RefreshCw, X,
  Radio, VideoOff, RotateCcw, ChevronLeft as PrevIcon, ChevronRight as NextIcon
} from "lucide-react";
import { MjpegPlayer } from "@/components/MjpegPlayer";
import { getVideoBackendUrl } from "@/lib/api";
import type { CameraMeta } from "./types";

interface CameraCardProps {
  cam: CameraMeta;
  sessionId?: string;
  isFocused: boolean;
  onFocus: (cam: CameraMeta) => void;
}

export const CameraCard = memo(function CameraCard({
  cam,
  sessionId,
  isFocused,
  onFocus,
}: CameraCardProps) {
  const isConnected = !!cam.is_connected;
  return (
    <div
      className={`group relative rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900/95 via-[#0B0F19] to-slate-950 border ${
        isConnected
          ? "border-slate-800/90 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10"
          : "border-slate-800/80 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10"
      } shadow-md aspect-video flex flex-col cursor-pointer transition-all duration-300`}
      onClick={() => onFocus(cam)}
    >
      {/* Subtle Ambient Radial Lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/[0.04] via-transparent to-transparent pointer-events-none" />

      {/* Top-Left Camera Label Badge */}
      <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-semibold text-slate-200 border border-slate-800/90 shadow-sm">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isConnected ? "bg-emerald-400 shadow-sm shadow-emerald-400/80 animate-pulse" : "bg-amber-400"
          }`}
        />
        <span className="tracking-wide font-medium">{cam.name}</span>
        <span
          className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
            isConnected
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          }`}
        >
          {isConnected ? "Live 4K" : "Standby"}
        </span>
      </div>

      {/* Top-Right Maximize / Studio Focus Action */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFocus(cam);
        }}
        className="absolute top-2.5 right-2.5 z-10 p-1.5 rounded-lg bg-slate-950/70 backdrop-blur-md text-slate-400 hover:text-white hover:bg-slate-800/90 border border-slate-800/80 opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm"
        title="Focus Camera Studio"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>

      {/* Video Content or Sleek Native Dormant Card */}
      {isConnected ? (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <MjpegPlayer
            url={`${getVideoBackendUrl(cam.index)}/api/video-feed/${sessionId}?camera_index=${cam.index}&grid=1`}
            className="w-full h-full object-contain"
            fallbackText="Connecting..."
            paused={isFocused}
          />
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-3 select-none relative">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex items-center justify-center shadow-inner group-hover:scale-105 group-hover:border-slate-700/80 transition-all duration-300 mb-2">
            <VideoOff className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500 group-hover:text-slate-400 transition-colors" />
          </div>

          <span className="text-[11px] sm:text-xs font-semibold text-slate-300 group-hover:text-white transition-colors tracking-tight">
            {cam.name} Node Offline
          </span>

          <div className="flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full bg-slate-900/80 border border-slate-800 text-[10px] text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
            <span className="text-amber-400/90 font-medium">Dormant</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-500 text-[9px]">Power Saver</span>
          </div>

          {/* Quick Hover Bottom Cue */}
          <div className="absolute bottom-2 inset-x-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <span className="text-[9px] font-medium text-indigo-300 bg-indigo-950/80 px-2.5 py-0.5 rounded-md border border-indigo-800/50 backdrop-blur-sm flex items-center gap-1">
              <Maximize2 className="w-2.5 h-2.5" /> Studio Focus
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

export interface LiveScanCctvStudioProps {
  mode: "grid" | "cctv";
  cctvCameras: CameraMeta[];
  sessionId?: string;
  selectedCctvIndex: number;
  onSelectCctvIndex: (index: number) => void;
  isRecheckingCameras: boolean;
  onRecheckCameras: () => void;
  focusedCamera: CameraMeta | null;
  onFocusCamera: (cam: CameraMeta | null) => void;
  isModalFullscreen: boolean;
  onToggleFullscreen: () => void;
  isAutoTourActive: boolean;
  onToggleAutoTour: () => void;
  tourIntervalSeconds: number;
  onChangeTourInterval: (seconds: number) => void;
  tourCountdown: number;
}

export const LiveScanCctvStudio = memo(function LiveScanCctvStudio({
  mode,
  cctvCameras,
  sessionId,
  selectedCctvIndex,
  onSelectCctvIndex,
  isRecheckingCameras,
  onRecheckCameras,
  focusedCamera,
  onFocusCamera,
  isModalFullscreen,
  onToggleFullscreen,
  isAutoTourActive,
  onToggleAutoTour,
  tourIntervalSeconds,
  onChangeTourInterval,
  tourCountdown,
}: LiveScanCctvStudioProps) {
  // Split cameras into Back Row (2nd Row) and Front Row (1st Row)
  const backRowCameras = useMemo(
    () => cctvCameras.filter((c) => c.row.includes("2nd") || c.name.includes("2nd") || c.index >= 3),
    [cctvCameras]
  );
  const frontRowCameras = useMemo(
    () => cctvCameras.filter((c) => c.row.includes("1st") || c.name.includes("1st") || c.index < 3),
    [cctvCameras]
  );

  const handleNextCamera = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!focusedCamera) return;
    const nextIdx = (focusedCamera.index + 1) % cctvCameras.length;
    onFocusCamera(cctvCameras[nextIdx]);
  }, [cctvCameras, focusedCamera, onFocusCamera]);

  const handlePrevCamera = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!focusedCamera) return;
    const prevIdx = (focusedCamera.index - 1 + cctvCameras.length) % cctvCameras.length;
    onFocusCamera(cctvCameras[prevIdx]);
  }, [cctvCameras, focusedCamera, onFocusCamera]);

  // Keyboard navigation for Focused Camera Modal
  useEffect(() => {
    if (!focusedCamera) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onFocusCamera(null);
      } else if (e.key === "ArrowRight") {
        handleNextCamera();
      } else if (e.key === "ArrowLeft") {
        handlePrevCamera();
      } else if (e.key === "f" || e.key === "F") {
        onToggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedCamera, handleNextCamera, handlePrevCamera, onFocusCamera, onToggleFullscreen]);

  return (
    <>
      {mode === "grid" ? (
        /* 6-CAMERA SPLIT SCREEN MATRIX */
        <div className="flex-1 flex flex-col gap-3 sm:gap-4">
          {/* Hall Orientation Banner */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800/80 text-[11px] sm:text-xs font-medium text-slate-300">
            <span className="flex items-center gap-2 truncate">
              {cctvCameras.some((c) => c.is_connected) ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>CP PLUS Vision Hub (6 Nodes Synchronized • 4K AI Stream)</span>
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                  <span className="text-amber-300 font-semibold">
                    CP PLUS Vision Hub (6 Nodes Standby / Dormant • Mobile Attendance Active)
                  </span>
                </>
              )}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onRecheckCameras}
                disabled={isRecheckingCameras}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[10px] sm:text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-all disabled:opacity-50"
                title="Probe camera connections"
              >
                <RefreshCw className={`w-3 h-3 ${isRecheckingCameras ? "animate-spin text-amber-400" : "text-slate-400"}`} />
                <span>{isRecheckingCameras ? "Probing..." : "Recheck Nodes"}</span>
              </button>
              <span className="text-slate-500 text-[11px] hidden md:inline">
                Click any feed to focus
              </span>
            </div>
          </div>

          {/* 2nd Row (Back of Hall) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/80" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Back Section • 2nd Row
                </span>
                <span className="text-[10px] text-slate-500 font-normal">
                  (Cameras 2L, 2M, 2R)
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {backRowCameras.map((cam) => (
                <CameraCard
                  key={cam.id}
                  cam={cam}
                  sessionId={sessionId}
                  isFocused={focusedCamera !== null}
                  onFocus={onFocusCamera}
                />
              ))}
            </div>
          </div>

          {/* 1st Row (Front of Hall) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/80" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Front Section • 1st Row
                </span>
                <span className="text-[10px] text-slate-500 font-normal">
                  (Cameras 1L, 1M, 1R)
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {frontRowCameras.map((cam) => (
                <CameraCard
                  key={cam.id}
                  cam={cam}
                  sessionId={sessionId}
                  isFocused={focusedCamera !== null}
                  onFocus={onFocusCamera}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* SINGLE CAMERA VIEW WITH AUTO-TOUR */
        <div className="w-full max-w-full min-w-0 flex-1 flex flex-col items-center justify-center bg-slate-950 rounded-2xl relative overflow-hidden group aspect-video min-h-[220px] sm:min-h-[360px] lg:min-h-[440px] border border-slate-800">
          {/* Top Control Bar */}
          <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Camera Selector Dropdown */}
            <div className="bg-slate-900/90 backdrop-blur-md rounded-xl shadow-xl border border-slate-700/70 text-xs flex items-center pr-2">
              <div className="pl-2.5 sm:pl-3 py-1.5 sm:py-2 border-r border-slate-700/70">
                <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400" />
              </div>
              <select
                className="py-1.5 sm:py-2 pl-2 pr-5 sm:pr-6 border-0 bg-transparent text-white font-medium focus:ring-0 cursor-pointer outline-none w-full max-w-[140px] sm:max-w-[200px] text-xs sm:text-sm truncate"
                value={selectedCctvIndex}
                onChange={(e) => onSelectCctvIndex(Number(e.target.value))}
              >
                {cctvCameras.map((cam) => (
                  <option key={cam.id} value={cam.index} className="bg-slate-900 text-white">
                    {cam.name} ({cam.position} - {cam.row.split(" ")[0]})
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Prev / Next Buttons */}
            <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md rounded-xl p-1 border border-slate-700/70 shadow-xl">
              <button
                type="button"
                onClick={() => onSelectCctvIndex((selectedCctvIndex - 1 + cctvCameras.length) % cctvCameras.length)}
                className="p-1 sm:p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Previous Camera"
              >
                <PrevIcon className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-bold px-1 text-indigo-400">
                {selectedCctvIndex + 1}/{cctvCameras.length}
              </span>
              <button
                type="button"
                onClick={() => onSelectCctvIndex((selectedCctvIndex + 1) % cctvCameras.length)}
                className="p-1 sm:p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Next Camera"
              >
                <NextIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Auto-Tour Toggle Button */}
            <button
              type="button"
              onClick={onToggleAutoTour}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-semibold backdrop-blur-md shadow-xl border transition-all cursor-pointer ${
                isAutoTourActive
                  ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-emerald-500/20 shadow-lg"
                  : "bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-800 border-slate-700/70"
              }`}
              title={isAutoTourActive ? "Pause Auto-Scan Tour" : "Start Auto-Scan Tour"}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isAutoTourActive ? "animate-spin text-emerald-400" : "text-indigo-400"}`} />
              <span>{isAutoTourActive ? `Touring (${tourCountdown}s)` : "Auto-Tour"}</span>
              {isAutoTourActive && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping ml-0.5" />
              )}
            </button>

            {/* Tour Interval Speed Selector */}
            {isAutoTourActive && (
              <select
                value={tourIntervalSeconds}
                onChange={(e) => onChangeTourInterval(Number(e.target.value))}
                className="bg-slate-900/90 backdrop-blur-md text-emerald-400 font-bold border border-emerald-500/40 rounded-xl px-2 py-1.5 text-xs outline-none cursor-pointer"
                title="Change Tour Interval Speed"
              >
                <option value={5} className="bg-slate-900 text-white">5s Cycle</option>
                <option value={8} className="bg-slate-900 text-white">8s Cycle</option>
                <option value={12} className="bg-slate-900 text-white">12s Cycle</option>
                <option value={15} className="bg-slate-900 text-white">15s Cycle</option>
              </select>
            )}
          </div>

          <div className="absolute inset-0 w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
            {cctvCameras[selectedCctvIndex]?.is_connected && sessionId ? (
              <MjpegPlayer
                key={selectedCctvIndex}
                url={`${getVideoBackendUrl(selectedCctvIndex)}/api/video-feed/${sessionId}?camera_index=${selectedCctvIndex}&grid=0`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-900/90 via-[#0B0F19] to-slate-950 select-none text-center relative">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(99,102,241,0.06),transparent_60%)]" />
                <div className="relative w-14 h-14 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex items-center justify-center shadow-lg mb-3">
                  <VideoOff className="w-6 h-6 text-slate-500" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">
                  {cctvCameras[selectedCctvIndex]?.name || "Camera"} Node Standby
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Hardware stream is currently offline or dormant. Mobile selfie check-in is active for attendance.
                </p>
                <div className="flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
                  <span className="text-amber-400/90 font-medium">Dormant Standby</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-500 text-[10px]">Resource Saver</span>
                </div>
              </div>
            )}

            <div className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-slate-950/80 backdrop-blur-md rounded-full px-3 py-1 flex items-center shadow-lg border border-slate-800">
              <div className={`w-2 h-2 rounded-full mr-2 ${cctvCameras[selectedCctvIndex]?.is_connected ? "bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              <span className="text-white text-[11px] font-semibold tracking-wider">
                {cctvCameras[selectedCctvIndex]?.is_connected ? "LIVE 4K AI" : "STANDBY"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Studio Camera Focus Modal */}
      {focusedCamera && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md transition-all ${
            isModalFullscreen ? "p-0" : "p-2 sm:p-4 md:p-6 lg:p-7"
          }`}
          onClick={() => onFocusCamera(null)}
        >
          <div
            className={`bg-[#0A0E17] border border-slate-800/90 shadow-2xl flex flex-col relative transition-all duration-200 overflow-hidden ${
              isModalFullscreen
                ? "w-screen h-screen rounded-none border-0"
                : "w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1680px] max-h-[94vh] rounded-2xl sm:rounded-3xl"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Bar */}
            <div className="flex items-center justify-between px-3 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-800/80 bg-slate-900/95 shrink-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <h3 className="text-sm sm:text-base md:text-lg font-bold text-white truncate">
                  Camera {focusedCamera.name}
                </h3>
                <span className="text-xs bg-indigo-500/10 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/20 hidden sm:inline shrink-0 font-medium">
                  {focusedCamera.row}
                </span>
                <span className="text-[11px] font-mono text-slate-400 bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700 hidden md:inline shrink-0">
                  {focusedCamera.ip}
                </span>
              </div>

              {/* Quick Camera Switcher Pills */}
              <div className="hidden lg:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/60">
                {cctvCameras.map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => onFocusCamera(cam)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      focusedCamera.id === cam.id
                        ? "bg-indigo-600 text-white shadow"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/80"
                    }`}
                  >
                    {cam.name}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {/* Camera Switcher Shortcuts */}
                <button
                  type="button"
                  onClick={handlePrevCamera}
                  className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700/60 cursor-pointer"
                  title="Previous Camera (←)"
                >
                  <PrevIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextCamera}
                  className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700/60 cursor-pointer"
                  title="Next Camera (→)"
                >
                  <NextIcon className="w-4 h-4" />
                </button>

                {/* Fullscreen Toggle Button */}
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-indigo-600/30 text-slate-300 hover:text-indigo-300 border border-slate-700/60 transition-all cursor-pointer"
                  title={isModalFullscreen ? "Exit Fullscreen" : "Fullscreen (F)"}
                >
                  {isModalFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>

                {/* Close button */}
                <button
                  type="button"
                  onClick={() => onFocusCamera(null)}
                  className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700/60 transition-all ml-1 cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Video Player Container */}
            <div
              className={`relative flex-1 min-h-0 bg-slate-950 flex items-center justify-center overflow-hidden w-full ${
                isModalFullscreen ? "h-full" : "aspect-video max-h-[78vh]"
              }`}
            >
              {focusedCamera.is_connected && sessionId ? (
                <MjpegPlayer
                  key={focusedCamera.id}
                  url={`${getVideoBackendUrl(focusedCamera.index)}/api/video-feed/${sessionId}?camera_index=${focusedCamera.index}&grid=0`}
                  className="w-full h-full object-contain"
                  fallbackText="Connecting to Camera Stream..."
                  paused={false}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-900/90 via-[#0B0F19] to-slate-950 select-none text-center relative">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(99,102,241,0.06),transparent_60%)]" />
                  <div className="relative w-16 h-16 rounded-3xl bg-slate-900/90 border border-slate-800/90 flex items-center justify-center shadow-xl mb-3">
                    <VideoOff className="w-7 h-7 text-slate-500" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-200">
                    {focusedCamera.name} Camera Node Standby
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm text-center mt-1">
                    This CCTV hardware node is currently disconnected or dormant. Mobile selfie attendance is active for students.
                  </p>
                  <div className="flex items-center gap-2 mt-3 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Dormant Standby Mode</span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-3 py-2 sm:px-5 sm:py-3 bg-slate-900/95 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${focusedCamera.is_connected ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <span className="truncate font-medium text-slate-300">
                    {focusedCamera.is_connected
                      ? "RTSP Stream: 4K Ultra-HD (Zero-Lag Synchronized)"
                      : "Camera Node Dormant / Standby (Conserving Host Resources)"}
                  </span>
                </span>
                <span className="hidden sm:inline text-slate-500 text-[11px]">
                  • Use <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-sans text-[10px]">←</kbd> <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-sans text-[10px]">→</kbd> to switch cameras • <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-sans text-[10px]">F</kbd> for fullscreen • <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-sans text-[10px]">Esc</kbd> to close
                </span>
              </div>
              <button
                type="button"
                onClick={() => onFocusCamera(null)}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-md shadow-indigo-600/20 text-xs sm:text-sm shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <Grid className="w-3.5 h-3.5" />
                Return to 6-Camera Grid
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

