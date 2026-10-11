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
  { id: "sub-1-anat", academic_year: "1st Year", name: "Anatomy", code: "ANAT", is_active: true },
  { id: "sub-1-phys", academic_year: "1st Year", name: "Physiology", code: "PHYS", is_active: true },
  { id: "sub-1-bioc", academic_year: "1st Year", name: "Biochemistry", code: "BIOC", is_active: true },
  { id: "sub-2-path", academic_year: "2nd Year", name: "Pathology", code: "PATH", is_active: true },
  { id: "sub-2-phar", academic_year: "2nd Year", name: "Pharmacology", code: "PHAR", is_active: true },
  { id: "sub-2-micr", academic_year: "2nd Year", name: "Microbiology", code: "MICR", is_active: true },
  { id: "sub-2-fmt",  academic_year: "2nd Year", name: "Forensic Medicine & Toxicology", code: "FMT", is_active: true },
  { id: "sub-3-opht", academic_year: "3rd Year", name: "Ophthalmology", code: "OPHT", is_active: true },
  { id: "sub-3-ent",  academic_year: "3rd Year", name: "ENT (Otorhinolaryngology)", code: "ENT", is_active: true },
  { id: "sub-3-comm", academic_year: "3rd Year", name: "Community Medicine", code: "COMM", is_active: true },
  { id: "sub-4-med",  academic_year: "4th Year", name: "General Medicine", code: "MED", is_active: true },
  { id: "sub-4-surg", academic_year: "4th Year", name: "General Surgery", code: "SURG", is_active: true },
  { id: "sub-4-ped",  academic_year: "4th Year", name: "Pediatrics", code: "PED", is_active: true },
  { id: "sub-4-obg",  academic_year: "4th Year", name: "Obstetrics & Gynaecology", code: "OBG", is_active: true },
];

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
