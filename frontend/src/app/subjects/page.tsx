"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen, Plus, RefreshCw, Trash2, Power, AlertTriangle,
  Shield, CheckCircle2, Loader2
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  AcademicSubject, ACADEMIC_YEARS, DEFAULT_MBBS_SUBJECTS,
  getCachedSubjects, saveCachedSubjects
} from "@/lib/academicSubjects";

export default function AcademicSubjectsPage() {
  const router = useRouter();
  const { user: currentUser, isLoading: isAuthLoading } = useAuth();

  const [subjects, setSubjects] = useState<AcademicSubject[]>(getCachedSubjects);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [selectedYearTab, setSelectedYearTab] = useState<string>("All");
  
  // Modals
  const [isAddSubjectModalOpen, setIsAddSubjectModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState({ academic_year: "1st Year", name: "", code: "" });
  const [isSubjectSubmitting, setIsSubjectSubmitting] = useState(false);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Deletion modal
  const [subjectToDelete, setSubjectToDelete] = useState<AcademicSubject | null>(null);
  const [isDeletingSubject, setIsDeletingSubject] = useState(false);

  // Role Gate: Super Admin & Admin allowed
  useEffect(() => {
    if (!isAuthLoading && currentUser && currentUser.role !== "Super Admin" && currentUser.role !== "Admin") {
      router.push("/");
    }
  }, [currentUser, isAuthLoading, router]);

  const fetchSubjects = async () => {
    setSubjectsLoading(true);
    try {
      const res = await fetch("/api/subjects");
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.subjects)) {
        setSubjects(data.subjects);
        saveCachedSubjects(data.subjects);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubjectsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubjectError(null);
    setIsSubjectSubmitting(true);
    try {
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSubject),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubjectError(data.error || "Failed to create subject.");
        return;
      }
      setIsAddSubjectModalOpen(false);
      setNewSubject({ academic_year: "1st Year", name: "", code: "" });
      setActionSuccess(`Academic Subject "${data.subject.name}" added successfully.`);
      fetchSubjects();
    } catch (err: any) {
      setSubjectError(err.message || "Failed to create subject.");
    } finally {
      setIsSubjectSubmitting(false);
    }
  };

  const confirmDeleteSubject = async () => {
    if (!subjectToDelete) return;
    setIsDeletingSubject(true);
    try {
      const res = await fetch(`/api/subjects/${subjectToDelete.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubjectError(data.error || "Failed to delete subject.");
        return;
      }
      setActionSuccess(`Subject "${subjectToDelete.name}" removed successfully.`);
      setSubjectToDelete(null);
      fetchSubjects();
    } catch (err: any) {
      setSubjectError(err.message || "Network error deleting subject.");
    } finally {
      setIsDeletingSubject(false);
    }
  };

  const toggleSubjectActive = async (subject: AcademicSubject) => {
    try {
      const res = await fetch(`/api/subjects/${subject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !subject.is_active }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchSubjects();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 p-4 sm:p-6 lg:p-8 transition-colors">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400">
                <BookOpen className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                Academic Subjects & Curriculum
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 ml-11">
              Configure MBBS curriculum departments and subject modules across academic cohorts.
            </p>
          </div>

          <div className="flex items-center gap-2.5 ml-11 sm:ml-0">
            <button
              onClick={fetchSubjects}
              disabled={subjectsLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${subjectsLoading ? "animate-spin" : ""}`} /> Refresh
            </button>
            {currentUser?.role === "Super Admin" ? (
              <button
                onClick={() => {
                  setSubjectError(null);
                  setNewSubject({
                    academic_year: selectedYearTab === "All" ? "1st Year" : selectedYearTab,
                    name: "",
                    code: "",
                  });
                  setIsAddSubjectModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm shadow-indigo-200 dark:shadow-none"
              >
                <Plus className="w-4 h-4" /> Add Subject
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <Shield className="w-3.5 h-3.5 text-amber-500" /> Super Admin Managed
              </span>
            )}
          </div>
        </div>

        {/* Success Alert */}
        {actionSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-800">✕</button>
          </div>
        )}

        {/* Quick Cohort Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {["All", ...ACADEMIC_YEARS].map(yr => {
            const count = yr === "All" ? subjects.length : subjects.filter(s => s.academic_year === yr).length;
            const isSelected = selectedYearTab === yr;
            return (
              <button
                key={yr}
                type="button"
                onClick={() => setSelectedYearTab(yr)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-none"
                    : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-indigo-300"
                }`}
              >
                <span>{yr === "All" ? "All Cohorts" : `${yr} MBBS`}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? "bg-indigo-700 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Year-by-Year Cards */}
        <div className="space-y-6">
          {ACADEMIC_YEARS.filter(yr => selectedYearTab === "All" || selectedYearTab === yr).map(yearName => {
            const yearSubjects = subjects.filter(s => s.academic_year === yearName);
            return (
              <div
                key={yearName}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm transition-colors"
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                      {yearName} MBBS
                    </span>
                    <span className="text-xs text-gray-400">
                      {yearSubjects.length} {yearSubjects.length === 1 ? "Subject registered" : "Subjects registered"}
                    </span>
                  </div>

                  {currentUser?.role === "Super Admin" && (
                    <button
                      onClick={() => {
                        setSubjectError(null);
                        setNewSubject({ academic_year: yearName, name: "", code: "" });
                        setIsAddSubjectModalOpen(true);
                      }}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add to {yearName}
                    </button>
                  )}
                </div>

                {yearSubjects.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-400">
                    No curriculum subjects registered for {yearName} MBBS.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {yearSubjects.map(sub => (
                      <div
                        key={sub.id}
                        className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${
                          sub.is_active
                            ? "bg-gray-50/70 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/60"
                            : "bg-gray-100/50 dark:bg-gray-800/20 border-dashed border-gray-200 dark:border-gray-800 opacity-60"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                            {sub.name}
                          </p>
                          {sub.code && (
                            <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 uppercase">
                              {sub.code}
                            </span>
                          )}
                        </div>

                        {currentUser?.role === "Super Admin" && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => toggleSubjectActive(sub)}
                              title={sub.is_active ? "Disable Subject" : "Enable Subject"}
                              className={`p-1 rounded-lg transition-colors ${
                                sub.is_active
                                  ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                  : "text-gray-400 hover:text-gray-600"
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setSubjectToDelete(sub)}
                              title="Delete Subject"
                              className="p-1 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Modal: Add New Subject */}
        {isAddSubjectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-gray-800 animate-fadeIn">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      Add Academic Subject
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      MBBS Curriculum Course Configuration
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddSubjectModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              {subjectError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{subjectError}</span>
                </div>
              )}

              <form onSubmit={handleCreateSubject} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Academic Year Cohort <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newSubject.academic_year}
                    onChange={e => setNewSubject({ ...newSubject, academic_year: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  >
                    {ACADEMIC_YEARS.map(yr => (
                      <option key={yr} value={yr}>
                        {yr} MBBS
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Subject / Department Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Anatomy, Physiology, Biochemistry..."
                    value={newSubject.name}
                    onChange={e => setNewSubject({ ...newSubject, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Subject Code (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ANAT, PHYS, BIOC"
                    value={newSubject.code}
                    onChange={e => setNewSubject({ ...newSubject, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                </div>

                <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddSubjectModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubjectSubmitting}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSubjectSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                      </>
                    ) : (
                      "Save Subject"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Subject Deletion Confirmation */}
        {subjectToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-gray-800 text-center animate-scaleIn">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 flex items-center justify-center text-rose-600 dark:text-rose-400 mx-auto mb-4 shadow-sm">
                <Trash2 className="w-7 h-7" />
              </div>

              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1.5">
                Delete Academic Subject?
              </h3>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4">
                Are you sure you want to permanently delete this subject from the medical curriculum?
              </p>

              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 text-left mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {subjectToDelete.code && (
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 shrink-0">
                      {subjectToDelete.code}
                    </span>
                  )}
                  <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {subjectToDelete.name}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
                  {subjectToDelete.academic_year} MBBS
                </span>
              </div>

              {subjectError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 text-left flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{subjectError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSubjectToDelete(null);
                    setSubjectError(null);
                  }}
                  disabled={isDeletingSubject}
                  className="w-1/2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteSubject}
                  disabled={isDeletingSubject}
                  className="w-1/2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-200 dark:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeletingSubject ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Subject</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
