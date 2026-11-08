import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { ClassroomPhotoTray } from "../ClassroomPhotoTray";
import { LiveAttendanceDrawer } from "../LiveAttendanceDrawer";
import { LiveScanCctvStudio } from "../LiveScanCctvStudio";
import { SessionSetupForm } from "../SessionSetupForm";
import { DEFAULT_CAMERAS } from "../types";
import { DEFAULT_GEOFENCE_CONFIG } from "@/lib/geofence";

describe("LiveScan Modular Sub-Components (ADR-054)", () => {
  describe("ClassroomPhotoTray", () => {
    const dummyPhotos = [
      {
        id: "p-1",
        file: new File(["dummy"], "p1.jpg", { type: "image/jpeg" }),
        previewUrl: "blob:http://localhost/p1",
        timestamp: Date.now(),
        label: "Photo 1",
        quality: { status: "good" as const, luminance: 120, variance: 150, message: "Good lighting" },
        compressionStatus: "ready" as const,
      },
      {
        id: "p-2",
        file: new File(["dummy"], "p2.jpg", { type: "image/jpeg" }),
        previewUrl: "blob:http://localhost/p2",
        timestamp: Date.now(),
        label: "Photo 2",
        quality: { status: "blurry" as const, luminance: 110, variance: 10, message: "Camera shake" },
        compressionStatus: "compressing" as const,
      },
    ];

    it("renders staged photo count and badges", () => {
      render(
        <ClassroomPhotoTray
          queuedPhotos={dummyPhotos}
          isOnline={true}
          isProcessing={false}
          onStartSmartCamera={vi.fn()}
          onOpenGallery={vi.fn()}
          onRemovePhoto={vi.fn()}
          onClearPhotos={vi.fn()}
        />
      );

      expect(screen.getByText("2 Photos Staged")).toBeInTheDocument();
      expect(screen.getByText("IndexedDB Staged")).toBeInTheDocument();
      expect(screen.getByText("Photo 1")).toBeInTheDocument();
      expect(screen.getByText("Clear")).toBeInTheDocument();
      expect(screen.getByText("Photo 2")).toBeInTheDocument();
      expect(screen.getByText("Blurry")).toBeInTheDocument();
    });

    it("displays offline indicator when connection drops", () => {
      render(
        <ClassroomPhotoTray
          queuedPhotos={dummyPhotos}
          isOnline={false}
          isProcessing={false}
          onStartSmartCamera={vi.fn()}
          onOpenGallery={vi.fn()}
          onRemovePhoto={vi.fn()}
          onClearPhotos={vi.fn()}
        />
      );

      expect(screen.getByText("Offline (IndexedDB Staged)")).toBeInTheDocument();
    });

    it("invokes delete and clear callbacks", async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      const onClear = vi.fn();

      render(
        <ClassroomPhotoTray
          queuedPhotos={dummyPhotos}
          isOnline={true}
          isProcessing={false}
          onStartSmartCamera={vi.fn()}
          onOpenGallery={vi.fn()}
          onRemovePhoto={onRemove}
          onClearPhotos={onClear}
        />
      );

      const deleteButtons = screen.getAllByTitle("Delete this photo");
      await user.click(deleteButtons[0]);
      expect(onRemove).toHaveBeenCalledWith("p-1");

      const clearBtn = screen.getByTitle("Clear all staged photos");
      await user.click(clearBtn);
      expect(onClear).toHaveBeenCalled();
    });
  });

  describe("LiveAttendanceDrawer", () => {
    const dummyLogs = [
      {
        id: "log-1",
        student_id: "stu-1",
        session_id: "sess-1",
        status: "Present",
        capture_mode: "Manual Upload",
        recorded_at: "2026-11-08T10:00:00Z",
        students: { full_name: "Rahim Ahmed", student_roll: "BM-101" },
      },
    ];

    const dummyAbsent = [
      {
        id: "stu-2",
        full_name: "Karim Uddin",
        student_roll: "BM-102",
      },
    ];

    it("renders present student cards and switches tabs", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();

      render(
        <LiveAttendanceDrawer
          sidebarTab="present"
          onTabChange={onTabChange}
          searchQuery=""
          onSearchChange={vi.fn()}
          logs={dummyLogs}
          absentStudents={dummyAbsent}
          undoingLogId={null}
          markingStudentId={null}
          onUndoLog={vi.fn()}
          onMarkPresent={vi.fn()}
        />
      );

      expect(screen.getByText("RAHIM AHMED")).toBeInTheDocument();
      expect(screen.getByText("BM-101")).toBeInTheDocument();
      expect(screen.getByText("Faculty Verified")).toBeInTheDocument();

      const absentTabBtn = screen.getByRole("button", { name: /Absent \(1\)/i });
      await user.click(absentTabBtn);
      expect(onTabChange).toHaveBeenCalledWith("absent");
    });

    it("triggers 1-click mark present for absent students", async () => {
      const user = userEvent.setup();
      const onMarkPresent = vi.fn();

      render(
        <LiveAttendanceDrawer
          sidebarTab="absent"
          onTabChange={vi.fn()}
          searchQuery=""
          onSearchChange={vi.fn()}
          logs={dummyLogs}
          absentStudents={dummyAbsent}
          undoingLogId={null}
          markingStudentId={null}
          onUndoLog={vi.fn()}
          onMarkPresent={onMarkPresent}
        />
      );

      expect(screen.getByText("KARIM UDDIN")).toBeInTheDocument();
      const markBtn = screen.getByRole("button", { name: /Mark Present/i });
      await user.click(markBtn);
      expect(onMarkPresent).toHaveBeenCalledWith("stu-2");
    });
  });

  describe("LiveScanCctvStudio", () => {
    it("renders 6 cameras split across back and front rows", () => {
      render(
        <LiveScanCctvStudio
          mode="grid"
          cctvCameras={DEFAULT_CAMERAS}
          selectedCctvIndex={0}
          onSelectCctvIndex={vi.fn()}
          isRecheckingCameras={false}
          onRecheckCameras={vi.fn()}
          focusedCamera={null}
          onFocusCamera={vi.fn()}
          isModalFullscreen={false}
          onToggleFullscreen={vi.fn()}
          isAutoTourActive={false}
          onToggleAutoTour={vi.fn()}
          tourIntervalSeconds={8}
          onChangeTourInterval={vi.fn()}
          tourCountdown={8}
        />
      );

      expect(screen.getByText("Back Section • 2nd Row")).toBeInTheDocument();
      expect(screen.getByText("Front Section • 1st Row")).toBeInTheDocument();
      expect(screen.getByText("1L Node Offline")).toBeInTheDocument();
      expect(screen.getByText("2R Node Offline")).toBeInTheDocument();
    });
  });

  describe("SessionSetupForm", () => {
    it("renders cohort, subject and GPS shield toggle", () => {
      render(
        <SessionSetupForm
          setupData={{
            subject: "Anatomy",
            hall: "Lecture Hall 1",
            topic: "Heart Anatomy",
            academic_year: "1st Year",
            sub_batch: "All",
          }}
          setSetupData={vi.fn()}
          customHallName=""
          setCustomHallName={vi.fn()}
          availableCohortSubjects={[
            { id: "sub-1", name: "Anatomy", code: "ANAT101", academic_year: "1st Year", is_active: true },
          ]}
          onCohortChange={vi.fn()}
          sessionGeofence={DEFAULT_GEOFENCE_CONFIG}
          onToggleGeofence={vi.fn()}
          onStartGpsCalibration={vi.fn()}
          onResetGeofence={vi.fn()}
          capturingSessionGPS={false}
          isStartingSession={false}
          onSubmit={vi.fn()}
        />
      );

      expect(screen.getByText("Start Attendance Session")).toBeInTheDocument();
      expect(screen.getByText("Target Student Cohort")).toBeInTheDocument();
      expect(screen.getByText("Classroom GPS Shield")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Launch Live Attendance Session/i })).toBeInTheDocument();
    });
  });
});
