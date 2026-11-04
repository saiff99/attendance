export type CaptureMode = 'Live Scan' | 'Manual Upload' | 'Selfie Scan' | 'Manual Entry' | 'Selfie Check-in';
export type UserRole = 'Super Admin' | 'Admin' | 'Faculty' | 'Student';

export interface Student {
  id: string;
  student_roll: string;
  full_name: string;
  email: string;
  academic_year?: string;
  parent_phone?: string;
  face_encoding?: Record<string, unknown> | boolean | number[] | null;
  has_face?: boolean;
  is_active?: boolean;
  archived_at?: string | null;
  biometric_consent?: boolean;
  consent_timestamp?: string | null;
  pin?: string;
  portal_pin?: string | null;
  portal_password_hash?: string | null;
  raw_password?: string;
  created_at: string;
}

export interface Session {
  id: string;
  class_name: string;
  date: string;
  start_time: string;
  end_time: string;
  instructor_name: string;
  target_academic_year?: string;
  is_archived?: boolean;
  archived_at?: string | null;
  attendance?: { count: number }[] | Array<Record<string, unknown>>;
  creator_name?: string | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  session_id: string;
  student_id: string;
  status: 'Present' | 'Absent';
  capture_mode: CaptureMode;
  confidence_score?: number;
  recorded_at: string;
}

export interface AppUser {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  password_hash?: string;
  is_builtin?: boolean;
  created_at?: string;
}

export interface AcademicSubject {
  id: string;
  subject_name: string;
  subject_code?: string | null;
  target_academic_year?: string | null;
  created_at?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  actor_id: string;
  timestamp: string;
  ip_address?: string | null;
  user_agent?: string | null;
  details?: Record<string, unknown> | null;
}

export interface GeofenceConfig {
  latitude: number;
  longitude: number;
  radius: number;
  enabled: boolean;
  campusName?: string;
  polygon?: Array<[number, number]>;
}

