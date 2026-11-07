/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import {
  X, ZoomIn, ZoomOut, RotateCcw, Check, UserCheck, AlertCircle,
  Search, ChevronLeft, ChevronRight, Eye, CheckCircle2,
  Filter
} from "lucide-react";
import { useModalBehavior } from "@/hooks";

export interface DetectedFaceBox {
  face_id: string;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  bbox_norm?: [number, number, number, number]; // [left, top, width, height] normalized (0.0 - 1.0)
  det_score: number;
  matched: boolean;
  student_id?: string | null;
  student_name?: string | null;
  student_roll?: string | number | null;
  confidence?: number | null;
  isManuallyAssigned?: boolean;
  isDismissed?: boolean;
}

export interface InspectorPhotoItem {
  id: string;
  label: string;
  previewUrl: string;
  faces: DetectedFaceBox[];
  imageWidth?: number;
  imageHeight?: number;
}

export interface FaceInspectorModalProps {
  isOpen: boolean;
  photos: InspectorPhotoItem[];
  initialPhotoIndex?: number;
  absentStudents: Array<{ id: string; full_name?: string; student_roll?: string | number }>;
  onClose: () => void;
  onManualMarkPresent: (studentId: string, faceId?: string) => Promise<void>;
}

export function FaceInspectorModal({
  isOpen,
  photos,
  initialPhotoIndex = 0,
  absentStudents,
  onClose,
  onManualMarkPresent,
}: FaceInspectorModalProps) {
  const [activePhotoIdx, setActivePhotoIdx] = useState(initialPhotoIndex);
  const [prevInitialIdx, setPrevInitialIdx] = useState(initialPhotoIndex);
  const [localFacesMap, setLocalFacesMap] = useState<Record<string, DetectedFaceBox[]>>({});
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "unrecognized" | "identified">("all");
  const [searchStudentQuery, setSearchStudentQuery] = useState("");
  const [isMarking, setIsMarking] = useState(false);

  // Zoom & Pan Engine State
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const touchDistanceRef = useRef<number | null>(null);

  if (initialPhotoIndex !== prevInitialIdx) {
    setPrevInitialIdx(initialPhotoIndex);
    setActivePhotoIdx(initialPhotoIndex);
    setScale(1);
    setPan({ x: 0, y: 0 });
    setSelectedFaceId(null);
  }

  const containerRef = useRef<HTMLDivElement>(null);

  // Hook for standard ESC / backdrop behavior
  useModalBehavior({
    isOpen,
    onClose,
    modalRef: containerRef,
  });

  const currentPhoto = photos[activePhotoIdx];
  const currentFaces = useMemo(() => {
    if (!currentPhoto) return [];
    return localFacesMap[currentPhoto.id] || currentPhoto.faces || [];
  }, [currentPhoto, localFacesMap]);

  // Filter faces based on filterMode
  const visibleFaces = useMemo(() => {
    return currentFaces.filter((face) => {
      if (face.isDismissed) return false;
      const isIdentified = face.matched || face.isManuallyAssigned;
      if (filterMode === "unrecognized") return !isIdentified;
      if (filterMode === "identified") return isIdentified;
      return true;
    });
  }, [currentFaces, filterMode]);

  const stats = useMemo(() => {
    const active = currentFaces.filter((f) => !f.isDismissed);
    const identified = active.filter((f) => f.matched || f.isManuallyAssigned).length;
    const unrecognized = active.length - identified;
    return { total: active.length, identified, unrecognized };
  }, [currentFaces]);

  const selectedFace = useMemo(() => {
    if (!selectedFaceId) return null;
    return currentFaces.find((f) => f.face_id === selectedFaceId) || null;
  }, [selectedFaceId, currentFaces]);

  // Filter absent students for 1-tap manual assignment
  const filteredAbsentStudents = useMemo(() => {
    if (!searchStudentQuery.trim()) return absentStudents;
    const q = searchStudentQuery.toLowerCase();
    return absentStudents.filter((s) => {
      const name = s.full_name?.toLowerCase() || "";
      const roll = s.student_roll?.toString().toLowerCase() || "";
      return name.includes(q) || roll.includes(q);
    });
  }, [absentStudents, searchStudentQuery]);

  // Zoom helpers
  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(3.5, Number((prev + 0.35).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => {
      const next = Math.max(1, Number((prev - 0.35).toFixed(2)));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  // Mouse Drag Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch Drag & Pinch-to-Zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      touchDistanceRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    } else if (e.touches.length === 1 && scale > 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const diff = dist - touchDistanceRef.current;
      if (Math.abs(diff) > 8) {
        if (diff > 0) handleZoomIn();
        else handleZoomOut();
        touchDistanceRef.current = dist;
      }
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchDistanceRef.current = null;
  };

  // 1-Tap Manual Assignment Handler
  const handleAssignStudent = async (studentId: string) => {
    if (!selectedFace || isMarking) return;
    const student = absentStudents.find((s) => s.id === studentId);
    if (!student) return;

    setIsMarking(true);
    try {
      await onManualMarkPresent(studentId, selectedFace.face_id);

      // Locally update face box to green identified state
      setLocalFacesMap((prev) => {
        const photoFaces = prev[currentPhoto.id] || currentPhoto.faces || [];
        const updated = photoFaces.map((f) => {
          if (f.face_id === selectedFace.face_id) {
            return {
              ...f,
              matched: true,
              isManuallyAssigned: true,
              student_id: student.id,
              student_name: student.full_name,
              student_roll: student.student_roll,
              confidence: 1.0,
            };
          }
          return f;
        });
        return { ...prev, [currentPhoto.id]: updated };
      });

      setSelectedFaceId(null);
      setSearchStudentQuery("");
    } finally {
      setIsMarking(false);
    }
  };

  // Dismiss false face
  const handleDismissFace = (faceId: string) => {
    setLocalFacesMap((prev) => {
      const photoFaces = prev[currentPhoto.id] || currentPhoto.faces || [];
      const updated = photoFaces.map((f) =>
        f.face_id === faceId ? { ...f, isDismissed: true } : f
      );
      return { ...prev, [currentPhoto.id]: updated };
    });
    if (selectedFaceId === faceId) setSelectedFaceId(null);
  };

  if (!isOpen || !currentPhoto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspector-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={containerRef}
        className="w-full max-w-5xl h-[92vh] max-h-[850px] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white relative"
      >
        {/* Top Header Command Bar */}
        <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 border-b border-slate-800/90 bg-slate-900/90 backdrop-blur flex items-center justify-between gap-2 z-20 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-teal-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-600/30">
              <Eye className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="inspector-modal-title"
                className="text-xs sm:text-sm font-bold text-white truncate flex items-center gap-1.5"
              >
                <span>Face Bounding-Box Inspector</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-medium border border-indigo-500/30 hidden sm:inline-block">
                  ADR-051
                </span>
              </h2>
              <p className="text-[10px] text-slate-400 truncate">
                {currentPhoto.label} • {stats.total} Detected ({stats.identified} Identified, {stats.unrecognized} Unrecognized)
              </p>
            </div>
          </div>

          {/* Top Right Controls & Close */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Multi-Photo Pager */}
            {photos.length > 1 && (
              <div className="flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/60 text-xs font-mono mr-1">
                <button
                  type="button"
                  disabled={activePhotoIdx === 0}
                  onClick={() => {
                    setActivePhotoIdx((prev) => Math.max(0, prev - 1));
                    handleResetZoom();
                    setSelectedFaceId(null);
                  }}
                  className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 transition cursor-pointer"
                  title="Previous Photo"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-[11px] font-semibold text-slate-300">
                  {activePhotoIdx + 1}/{photos.length}
                </span>
                <button
                  type="button"
                  disabled={activePhotoIdx === photos.length - 1}
                  onClick={() => {
                    setActivePhotoIdx((prev) => Math.min(photos.length - 1, prev + 1));
                    handleResetZoom();
                    setSelectedFaceId(null);
                  }}
                  className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 transition cursor-pointer"
                  title="Next Photo"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer"
              title="Close Inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Pills & Interactive HUD Toolbar */}
        <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-800/70 flex items-center justify-between gap-2 flex-wrap z-10 shrink-0">
          {/* Quick Category Filters */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[10px] text-slate-400 font-medium hidden sm:inline-flex items-center gap-1">
              <Filter className="w-3 h-3" />
              <span>Show:</span>
            </span>
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                filterMode === "all"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
              }`}
            >
              All ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("unrecognized")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                filterMode === "unrecognized"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-slate-800/80 text-rose-400 hover:bg-slate-800 border border-rose-500/30"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
              <span>Needs Review ({stats.unrecognized})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("identified")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                filterMode === "identified"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-800/80 text-emerald-400 hover:bg-slate-800"
              }`}
            >
              Identified ({stats.identified})
            </button>
          </div>

          {/* Zoom & Pan Toolbar */}
          <div className="flex items-center gap-1 bg-slate-800/90 rounded-xl p-1 border border-slate-700/60 ml-auto">
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono px-1.5 text-slate-300 font-bold min-w-[36px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            {scale !== 1 && (
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1 rounded-lg hover:bg-slate-700 text-indigo-400 hover:text-indigo-300 transition cursor-pointer ml-1"
                title="Reset Zoom (Fit to Screen)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Main Canvas Viewport with Pan & Pinch-to-Zoom */}
        <div
          className="flex-1 w-full h-full relative overflow-hidden bg-[#070A11] flex items-center justify-center select-none"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
        >
          {/* Scaled & Panned Image Frame */}
          <div
            className="relative transition-transform duration-75 origin-center max-w-full max-h-full"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            }}
          >
            {/* The Source Classroom Photo */}
            <img
              src={currentPhoto.previewUrl}
              alt={currentPhoto.label}
              className="max-h-[65vh] w-auto object-contain rounded-lg shadow-2xl block pointer-events-none"
              draggable={false}
            />

            {/* Bounding Box Overlays */}
            {visibleFaces.map((face) => {
              if (!face.bbox_norm) return null;
              const [leftNorm, topNorm, widthNorm, heightNorm] = face.bbox_norm;
              const isSelected = selectedFaceId === face.face_id;
              const isIdentified = face.matched || face.isManuallyAssigned;

              return (
                <div
                  key={face.face_id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFaceId(face.face_id);
                  }}
                  className={`absolute rounded transition-all cursor-pointer ${
                    isIdentified
                      ? isSelected
                        ? "border-2 border-emerald-400 ring-2 ring-emerald-400/50 bg-emerald-500/20 shadow-lg shadow-emerald-500/30 z-30"
                        : "border-2 border-emerald-500/80 hover:border-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 z-10"
                      : isSelected
                      ? "border-2 border-rose-400 ring-2 ring-rose-400/50 bg-rose-500/25 shadow-lg shadow-rose-500/30 z-30 animate-pulse"
                      : "border-2 border-rose-500/85 hover:border-rose-400 bg-rose-500/15 hover:bg-rose-500/25 z-20"
                  }`}
                  style={{
                    left: `${leftNorm * 100}%`,
                    top: `${topNorm * 100}%`,
                    width: `${widthNorm * 100}%`,
                    height: `${heightNorm * 100}%`,
                  }}
                  title={
                    isIdentified
                      ? `${face.student_name} (${face.student_roll || "N/A"})`
                      : "Unrecognized Face - Tap to manually identify"
                  }
                >
                  {/* Identification Pill Badge floating above the box */}
                  <div
                    className={`absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold shadow-md pointer-events-none flex items-center gap-1 ${
                      isIdentified
                        ? "bg-emerald-600/95 text-white"
                        : "bg-rose-600/95 text-white"
                    }`}
                  >
                    {isIdentified ? (
                      <>
                        <Check className="w-2.5 h-2.5" />
                        <span className="truncate max-w-[120px]">{face.student_name}</span>
                        {face.confidence && (
                          <span className="opacity-80 font-mono">
                            {Math.round(face.confidence * 100)}%
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-2.5 h-2.5" />
                        <span>Unrecognized</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Drawer / Selected Face 1-Tap Action Card */}
        {selectedFace && (
          <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl p-3 z-40 backdrop-blur-xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    selectedFace.matched || selectedFace.isManuallyAssigned
                      ? "bg-emerald-400"
                      : "bg-rose-500 animate-pulse"
                  }`}
                />
                <h4 className="text-xs font-bold text-white">
                  {selectedFace.matched || selectedFace.isManuallyAssigned
                    ? "Face Identified"
                    : "1-Tap Manual Correction"}
                </h4>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleDismissFace(selectedFace.face_id)}
                  className="px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                  title="Dismiss false face detection"
                >
                  Dismiss Box
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFaceId(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Identified Face Info */}
            {selectedFace.matched || selectedFace.isManuallyAssigned ? (
              <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-600/30 rounded-xl p-2.5">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-bold text-emerald-200 truncate">
                    {selectedFace.student_name}
                  </p>
                  <p className="text-[10px] text-emerald-400/80 font-mono">
                    Roll: {selectedFace.student_roll || "N/A"} •{" "}
                    {selectedFace.isManuallyAssigned
                      ? "Manual Verified ✍️"
                      : `Confidence: ${Math.round((selectedFace.confidence || 0) * 100)}%`}
                  </p>
                </div>
                <div className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold shrink-0 flex items-center gap-1 shadow-sm">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verified</span>
                </div>
              </div>
            ) : (
              /* Unrecognized Face: 1-Tap Student Selector */
              <div>
                <p className="text-[11px] text-slate-300 mb-2">
                  Select the student who corresponds to this face to immediately mark present:
                </p>

                {/* Search absent student input with 16px font-size to prevent iOS Safari auto-zoom */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={searchStudentQuery}
                    onChange={(e) => setSearchStudentQuery(e.target.value)}
                    placeholder="Search absent student name or roll..."
                    style={{ fontSize: "16px" }}
                    className="w-full bg-slate-950/90 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                {/* Absent Students Quick-Tap List */}
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {filteredAbsentStudents.length === 0 ? (
                    <p className="text-[11px] text-slate-500 text-center py-2">
                      No matching absent students found.
                    </p>
                  ) : (
                    filteredAbsentStudents.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-1.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-950 transition"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold text-slate-200 truncate">
                            {s.full_name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            Roll: {s.student_roll || "N/A"}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isMarking}
                          onClick={() => handleAssignStudent(s.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1 transition shadow active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
                        >
                          <UserCheck className="w-3 h-3" />
                          <span>Mark Present</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
