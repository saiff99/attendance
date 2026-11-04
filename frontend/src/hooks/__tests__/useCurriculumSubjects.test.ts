import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCurriculumSubjects } from '../useCurriculumSubjects';
import { AcademicSubject } from '@/lib/academicSubjects';

describe('useCurriculumSubjects hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('provides available cohort subjects and subject getter', () => {
    const { result } = renderHook(() => useCurriculumSubjects('1st Year'));
    expect(Array.isArray(result.current.availableCohortSubjects)).toBe(true);
    expect(typeof result.current.getNextSubjectForCohort).toBe('function');
  });

  it('allows manual updating of academic subjects', () => {
    const { result } = renderHook(() => useCurriculumSubjects('1st Year'));
    const dummySubject: AcademicSubject = {
      id: 'sub-1',
      name: 'Human Anatomy',
      academic_year: '1st Year',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    act(() => {
      result.current.setAcademicSubjects([dummySubject]);
    });

    expect(result.current.academicSubjects).toEqual([dummySubject]);
    expect(result.current.availableCohortSubjects).toContainEqual(dummySubject);
  });
});
