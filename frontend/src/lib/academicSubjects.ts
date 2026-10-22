export interface AcademicSubject {
  id: string;
  academic_year: string; // '1st Year', '2nd Year', '3rd Year', '4th Year'
  name: string;
  code?: string;
  department?: string;
  is_active: boolean;
  created_at?: string;
}

export const ACADEMIC_YEARS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
] as const;

export const DEFAULT_MBBS_SUBJECTS: AcademicSubject[] = [
  // 1st Year MBBS
  { id: "sub-1-anat", academic_year: "1st Year", name: "Anatomy", is_active: true },
  { id: "sub-1-bioc", academic_year: "1st Year", name: "Biochemistry", is_active: true },
  { id: "sub-1-phys", academic_year: "1st Year", name: "Physiology", is_active: true },

  // 2nd Year MBBS
  { id: "sub-2-fmt",  academic_year: "2nd Year", name: "FMT", is_active: true },
  { id: "sub-2-micr", academic_year: "2nd Year", name: "Microbiology", is_active: true },
  { id: "sub-2-path", academic_year: "2nd Year", name: "Pathology", is_active: true },
  { id: "sub-2-phar", academic_year: "2nd Year", name: "Pharmacology", is_active: true },

  // 3rd Year MBBS
  { id: "sub-3-comm", academic_year: "3rd Year", name: "Community Medicine", is_active: true },
  { id: "sub-3-ent",  academic_year: "3rd Year", name: "ENT", is_active: true },
  { id: "sub-3-eye",  academic_year: "3rd Year", name: "EYE", is_active: true },

  // 4th Year MBBS
  { id: "sub-4-med",  academic_year: "4th Year", name: "General Medicine", is_active: true },
  { id: "sub-4-surg", academic_year: "4th Year", name: "General Surgery", is_active: true },
  { id: "sub-4-obg",  academic_year: "4th Year", name: "OBG", is_active: true },
  { id: "sub-4-orth", academic_year: "4th Year", name: "Orthopedics", is_active: true },
  { id: "sub-4-ped",  academic_year: "4th Year", name: "Pediatrics", is_active: true },
];

export const CACHED_SUBJECTS_STORAGE_KEY = "medattend_cached_subjects";

/**
 * Returns instantaneous cached curriculum subjects from client storage,
 * completely preventing any flash of outdated default subjects during network fetch.
 */
export function getCachedSubjects(): AcademicSubject[] {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(CACHED_SUBJECTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
  }
  return DEFAULT_MBBS_SUBJECTS;
}

/**
 * Saves and synchronizes subjects to browser cache and notifies all listeners.
 */
export function saveCachedSubjects(subjects: AcademicSubject[]) {
  if (typeof window !== "undefined" && Array.isArray(subjects) && subjects.length > 0) {
    try {
      localStorage.setItem(CACHED_SUBJECTS_STORAGE_KEY, JSON.stringify(subjects));
      window.dispatchEvent(new Event("medattend-subjects-changed"));
    } catch {}
  }
}

/**
 * Filter subjects by academic year cohort (e.g. '1st Year' or '1st Year MBBS')
 */
export function getSubjectsForCohort(
  allSubjects: AcademicSubject[],
  cohort: string
): AcademicSubject[] {
  if (!cohort || cohort === "All") {
    return allSubjects.filter(s => s.is_active);
  }
  const cleanCohort = cohort.replace(/\s*MBBS.*/i, "").trim();
  return allSubjects.filter(
    s => s.is_active && (s.academic_year === cleanCohort || cohort.startsWith(s.academic_year))
  );
}
