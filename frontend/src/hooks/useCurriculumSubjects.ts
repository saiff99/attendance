import { useState, useEffect, useMemo, useCallback } from "react";
import {
  AcademicSubject,
  getCachedSubjects,
  saveCachedSubjects,
  getSubjectsForCohort,
} from "@/lib/academicSubjects";

export function useCurriculumSubjects(selectedCohort: string) {
  const [academicSubjects, setAcademicSubjects] = useState<AcademicSubject[]>(getCachedSubjects);

  // Fetch dynamic curriculum subjects on mount & sync in real-time
  useEffect(() => {
    let isMounted = true;
    const loadSubjects = async () => {
      try {
        const res = await fetch("/api/subjects");
        const data = await res.json();
        if (res.ok && data.subjects && Array.isArray(data.subjects) && data.subjects.length > 0 && isMounted) {
          setAcademicSubjects(data.subjects);
          saveCachedSubjects(data.subjects);
        }
      } catch {
        // Fallback to cached subjects
      }
    };
    void loadSubjects();

    const handleSync = () => {
      if (isMounted) {
        setAcademicSubjects(getCachedSubjects());
      }
    };
    window.addEventListener("medattend-subjects-changed", handleSync);
    window.addEventListener("storage", handleSync);

    return () => {
      isMounted = false;
      window.removeEventListener("medattend-subjects-changed", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, []);

  const availableCohortSubjects = useMemo(() => {
    return getSubjectsForCohort(academicSubjects, selectedCohort);
  }, [academicSubjects, selectedCohort]);

  const getNextSubjectForCohort = useCallback(
    (newCohort: string, currentSubject: string) => {
      const cohortSubs = getSubjectsForCohort(academicSubjects, newCohort);
      const isCurrentValid = cohortSubs.some((s) => s.name === currentSubject);
      return isCurrentValid ? currentSubject : cohortSubs.length > 0 ? cohortSubs[0].name : "General";
    },
    [academicSubjects]
  );

  return {
    academicSubjects,
    setAcademicSubjects,
    availableCohortSubjects,
    getNextSubjectForCohort,
  };
}
