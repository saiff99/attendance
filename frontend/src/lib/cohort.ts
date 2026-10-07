/**
 * MedAttend Intelligent Cohort & Sub-Group Matching Utility
 * 
 * Rules:
 * 1. If targetCohort is "All", "All Years", "All MBBS Batches", "All Group", empty or null:
 *    -> ALLOW ALL students across the entire institution.
 * 2. If targetCohort is a Base Year (e.g. "1st Year", "1st Year MBBS", "2nd Year"):
 *    -> ALLOW ALL students belonging to that year (regardless of whether they are Group A, Group B, Group C, or unassigned).
 * 3. If targetCohort specifies a specific Sub-Group (e.g. "1st Year (Group B)"):
 *    -> ALLOW ONLY students belonging to that specific sub-group in that year.
 */

export function isCohortMatching(
  targetCohort: string | null | undefined,
  studentYear: string | null | undefined
): boolean {
  if (!targetCohort) return true;
  const t = targetCohort.trim();
  const tLower = t.toLowerCase();

  // 1. Open to all students
  if (
    !t ||
    tLower === "all" ||
    tLower === "all years" ||
    tLower === "all mbbs batches" ||
    tLower === "all group" ||
    tLower.includes("all group") ||
    tLower.includes("full cohort")
  ) {
    return true;
  }

  if (!studentYear) return false;
  const s = studentYear.trim();
  const sLower = s.toLowerCase();

  // Helper: extract base year (e.g. "1st Year", "2nd Year")
  const getBaseYear = (str: string) => {
    return str
      .replace(/\s*\([^)]*\)/g, "") // strip (Group A), (Batch B), etc.
      .replace(/\s*mbbs/i, "")      // strip MBBS suffix
      .trim()
      .toLowerCase();
  };

  const targetBase = getBaseYear(t);
  const studentBase = getBaseYear(s);

  // Compare base year (e.g. "1st year" vs "1st year")
  if (targetBase && studentBase && targetBase !== studentBase) {
    const tDigit = targetBase.match(/\b\d+/)?.[0];
    const sDigit = studentBase.match(/\b\d+/)?.[0];
    if (tDigit && sDigit && tDigit !== sDigit) {
      return false;
    }
    if (!tDigit || !sDigit) {
      if (!studentBase.startsWith(targetBase) && !targetBase.startsWith(studentBase)) {
        return false;
      }
    }
  }

  // 2. Check Sub-Group / Section if target specifies one
  const targetGroupMatch = t.match(/\(((?:Group|Batch)\s*[^)]+)\)/i);
  if (targetGroupMatch) {
    const requiredGroup = targetGroupMatch[1]
      .trim()
      .toLowerCase()
      .replace(/^batch\s*/i, "group ");

    const studentGroupMatch = s.match(/\(((?:Group|Batch)\s*[^)]+)\)/i);
    if (!studentGroupMatch) {
      return false; // Student has no group, but session requires specific group
    }
    const studentGroup = studentGroupMatch[1]
      .trim()
      .toLowerCase()
      .replace(/^batch\s*/i, "group ");

    return requiredGroup === studentGroup;
  }

  // 3. Target is Full Class for that year -> ALL groups are allowed!
  return true;
}
