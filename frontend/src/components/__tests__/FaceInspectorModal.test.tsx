import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import {
  FaceInspectorModal,
  type InspectorPhotoItem,
  type DetectedFaceBox,
} from "../FaceInspectorModal";

describe("FaceInspectorModal component (ADR-051)", () => {
  const mockFaces: DetectedFaceBox[] = [
    {
      face_id: "face_0",
      bbox: [100, 50, 200, 250],
      bbox_norm: [0.1, 0.05, 0.1, 0.2],
      det_score: 0.95,
      matched: true,
      student_id: "student-1",
      student_name: "SK SAIFUDDIN",
      student_roll: "101",
      confidence: 0.92,
    },
    {
      face_id: "face_1",
      bbox: [300, 100, 400, 300],
      bbox_norm: [0.3, 0.1, 0.1, 0.2],
      det_score: 0.88,
      matched: false,
      student_id: null,
      student_name: null,
      confidence: null,
    },
  ];

  const mockPhotos: InspectorPhotoItem[] = [
    {
      id: "photo-1",
      label: "Photo 1",
      previewUrl: "blob:http://localhost:3000/mock-photo-1",
      faces: mockFaces,
      imageWidth: 1000,
      imageHeight: 1000,
    },
  ];

  const mockAbsentStudents = [
    { id: "student-2", full_name: "RAHUL SHARMA", student_roll: "102" },
    { id: "student-3", full_name: "ANANYA ROY", student_roll: "103" },
  ];

  it("renders inspector modal with photo title and face detection counts", () => {
    render(
      <FaceInspectorModal
        isOpen={true}
        photos={mockPhotos}
        absentStudents={mockAbsentStudents}
        onClose={vi.fn()}
        onManualMarkPresent={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByText("Face Bounding-Box Inspector")).toBeInTheDocument();
    expect(screen.getByText(/Photo 1 • 2 Detected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Needs Review \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Identified (1)" })).toBeInTheDocument();
  });

  it("filters faces when Needs Review filter button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <FaceInspectorModal
        isOpen={true}
        photos={mockPhotos}
        absentStudents={mockAbsentStudents}
        onClose={vi.fn()}
        onManualMarkPresent={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const needsReviewBtn = screen.getByRole("button", { name: /Needs Review \(1\)/ });
    await user.click(needsReviewBtn);

    // Only the unrecognized face should be visible
    expect(screen.getByText("Unrecognized")).toBeInTheDocument();
    expect(screen.queryByText("SK SAIFUDDIN")).not.toBeInTheDocument();
  });

  it("opens 1-tap manual identification popover and marks absent student present", async () => {
    const user = userEvent.setup();
    const handleMarkPresentMock = vi.fn().mockResolvedValue(undefined);

    render(
      <FaceInspectorModal
        isOpen={true}
        photos={mockPhotos}
        absentStudents={mockAbsentStudents}
        onClose={vi.fn()}
        onManualMarkPresent={handleMarkPresentMock}
      />
    );

    // Click on the unrecognized face box
    const unrecognizedBox = screen.getByTitle("Unrecognized Face - Tap to manually identify");
    await user.click(unrecognizedBox);

    // Popover header should appear
    expect(screen.getByText("1-Tap Manual Correction")).toBeInTheDocument();
    expect(screen.getByText("RAHUL SHARMA")).toBeInTheDocument();

    // Click Mark Present on RAHUL SHARMA
    const markButtons = screen.getAllByRole("button", { name: /Mark Present/i });
    await user.click(markButtons[0]);

    // onManualMarkPresent should be called with student ID and face ID
    expect(handleMarkPresentMock).toHaveBeenCalledWith("student-2", "face_1");
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <FaceInspectorModal
        isOpen={true}
        photos={mockPhotos}
        absentStudents={mockAbsentStudents}
        onClose={handleClose}
        onManualMarkPresent={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const closeBtn = screen.getByTitle("Close Inspector");
    await user.click(closeBtn);

    expect(handleClose).toHaveBeenCalled();
  });
});

