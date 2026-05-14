export interface Student {
  id: string;
  student_roll: string;
  full_name: string;
  email: string;
  academic_year?: string;
  face_encoding?: Record<string, unknown>;
  created_at: string;
}

export interface Session {
  id: string;
  class_name: string;
  date: string;
  start_time: string;
  end_time: string;
  instructor_name: string;
  created_at: string;
}

export interface Attendance {
  id: string;
  session_id: string;
  student_id: string;
  status: 'Present' | 'Absent';
  capture_mode: 'Live Scan' | 'Manual Upload';
  confidence_score?: number;
  recorded_at: string;
}
