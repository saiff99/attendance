import type { QualityAssessment } from "@/lib/frameQuality";
import type { DetectedFaceBox } from "@/components/FaceInspectorModal";

export interface CameraMeta {
  index: number;
  id: string;
  name: string;
  row: string;
  position: string;
  ip: string;
  url?: string;
  is_connected?: boolean;
  is_dormant?: boolean;
  circuit_breaker_state?: string;
}

export const DEFAULT_CAMERAS: CameraMeta[] = [
  { index: 0, id: "cam-1", name: "1L", row: "1st Row (Front)", position: "Left", ip: "172.16.7.5", is_connected: false, is_dormant: true, circuit_breaker_state: "DORMANT" },
  { index: 1, id: "cam-2", name: "1M", row: "1st Row (Front)", position: "Middle", ip: "172.16.7.3", is_connected: false, is_dormant: true, circuit_breaker_state: "DORMANT" },
  { index: 2, id: "cam-3", name: "1R", row: "1st Row (Front)", position: "Right", ip: "172.16.7.17", is_connected: false, is_dormant: true, circuit_breaker_state: "DORMANT" },
  { index: 3, id: "cam-4", name: "2L", row: "2nd Row (Back)", position: "Left", ip: "172.16.7.16", is_connected: false, is_dormant: true, circuit_breaker_state: "DORMANT" },
  { index: 4, id: "cam-5", name: "2M", row: "2nd Row (Back)", position: "Middle", ip: "172.16.7.18", is_connected: false, is_dormant: true, circuit_breaker_state: "DORMANT" },
  { index: 5, id: "cam-6", name: "2R", row: "2nd Row (Back)", position: "Right", ip: "172.16.7.9", is_connected: false, is_dormant: true, circuit_breaker_state: "DORMANT" },
];

export interface AttendanceLogItem {
  id: string;
  student_id: string;
  session_id: string;
  status: string;
  capture_mode: string;
  recorded_at: string;
  confidence_score?: number;
  students?: {
    full_name?: string;
    student_roll?: string | number;
  } | null;
}

export interface QueuedPhotoItem {
  id: string;
  file: File;
  previewUrl: string;
  timestamp: number;
  label: string;
  optimizedFile?: File;
  compressionStatus?: "compressing" | "ready" | "error";
  compressionStats?: {
    originalSize: number;
    compressedSize: number;
    width: number;
    height: number;
  };
  quality?: QualityAssessment;
  inspection?: {
    imageWidth: number;
    imageHeight: number;
    faces: DetectedFaceBox[];
    totalDetected: number;
    recognizedCount: number;
    unrecognizedCount: number;
  };
}

