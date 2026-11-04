import { supabaseServer } from '@/lib/supabaseServer';
import { AcademicSubject, DEFAULT_MBBS_SUBJECTS } from '@/lib/academicSubjects';

// Shared In-Memory Academic Subjects Cache (10-minute TTL)
// Eliminates redundant SQL queries against academic_subjects table across student portal and subject APIs
let cachedSubjects: AcademicSubject[] | null = null;
let subjectsCachedAt = 0;
export const SUBJECTS_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function getCachedAcademicSubjects(): Promise<AcademicSubject[]> {
  const now = Date.now();
  if (cachedSubjects && now - subjectsCachedAt < SUBJECTS_TTL_MS) {
    return cachedSubjects;
  }

  try {
    const { data, error } = await supabaseServer
      .from('academic_subjects')
      .select('id, academic_year, name, code, department, is_active, created_at')
      .order('academic_year', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      if (cachedSubjects) return cachedSubjects;
      return DEFAULT_MBBS_SUBJECTS;
    }

    if (data && data.length > 0) {
      cachedSubjects = data as AcademicSubject[];
      subjectsCachedAt = now;
      return cachedSubjects;
    } else {
      return DEFAULT_MBBS_SUBJECTS;
    }
  } catch (err) {
    console.error('Failed to fetch academic subjects for cache:', err);
    if (cachedSubjects) return cachedSubjects;
    return DEFAULT_MBBS_SUBJECTS;
  }
}

export function invalidateAcademicSubjectsCache(): void {
  cachedSubjects = null;
  subjectsCachedAt = 0;
}
