"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus, FileDown, MoreHorizontal, X, UploadCloud, Loader2, Edit2, Trash2, Folder, ArrowLeft, Users, FileSpreadsheet, ArrowUpDown, ArrowUp, ArrowDown, MessageSquare, Phone, AlertTriangle, Lock, KeyRound, CheckCircle2, UserX } from "lucide-react";
// Student Directory
import type { Student } from "@/types/database";
import { StudentProfileModal } from "@/components/StudentProfileModal";
import { FaceRegistrationModal } from "@/components/FaceRegistrationModal";
import { BulkImportModal } from "@/components/BulkImportModal";
import { getParentPhone, formatPhoneDisplay, encodeStudentEmail, cleanPhoneNumber } from "@/lib/studentContact";
import { useAuth } from "@/lib/auth";

// In-memory module cache for instant navigation between tabs without layout shift
let memoryStudentsCache: Student[] | null = null;

function getInitialStudents(): Student[] {
  if (memoryStudentsCache && memoryStudentsCache.length > 0) return memoryStudentsCache;
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem("medattend_students_cache");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          memoryStudentsCache = parsed;
          return parsed;
        }
      }
    } catch {
      // ignore
    }
  }
  return [];
}

export default function StudentDirectory() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const isSuperAdmin = user?.role === "Super Admin";

  useEffect(() => {
    if (!isLoading && user?.role === "Faculty") {
      router.replace("/");
    }
  }, [user?.role, isLoading, router]);

  const [searchTerm, setSearchTerm] = useState("");
  const [activeView, setActiveView] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>(() => getInitialStudents());
  const [loading, setLoading] = useState<boolean>(() => getInitialStudents().length === 0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Custom Centered Modal for PIN Reset
  const [resetPinTarget, setResetPinTarget] = useState<{ id: string; name: string; roll: string } | null>(null);
  const [isResettingPin, setIsResettingPin] = useState(false);
  const [resetPinSuccess, setResetPinSuccess] = useState<string | null>(null);
  const [resetPinError, setResetPinError] = useState<string | null>(null);
  const [resetPinTempPin, setResetPinTempPin] = useState<string | null>(null);
  const [pinCopied, setPinCopied] = useState(false);

  // Custom Modal for DPDP Biometric Revocation / Face Template Erasure
  const [revokeBiometricTarget, setRevokeBiometricTarget] = useState<{ id: string; name: string; roll: string } | null>(null);
  const [isRevokingBiometric, setIsRevokingBiometric] = useState(false);
  const [revokeBiometricSuccess, setRevokeBiometricSuccess] = useState<string | null>(null);
  const [revokeBiometricError, setRevokeBiometricError] = useState<string | null>(null);

  // Sorting State - default ordered by Roll Number ascending
  type SortField = 'student_roll' | 'full_name' | 'academic_year';
  type SortOrder = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>('student_roll');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Multi-select / Bulk Delete State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Profile Modal State
  const [selectedProfileStudent, setSelectedProfileStudent] = useState<Student | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Form State
  const [newStudent, setNewStudent] = useState({ student_roll: '', full_name: '', email: '', academic_year: '1st Year', sub_batch: 'All', parent_phone: '' });
  const [activeSubBatch, setActiveSubBatch] = useState<string>('All');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Real-time Duplicate Roll Number Detection
  const duplicateStudent = useMemo(() => {
    const clean = newStudent.student_roll.trim().toLowerCase();
    if (!clean) return null;
    return students.find(s =>
      s.student_roll.trim().toLowerCase() === clean &&
      (!editingId || s.id !== editingId)
    ) || null;
  }, [newStudent.student_roll, students, editingId]);

  // Face Registration Modal State
  const [isFaceModalOpen, setIsFaceModalOpen] = useState(false);
  const [faceModalStudentId, setFaceModalStudentId] = useState<string>("");
  const [faceModalStudentName, setFaceModalStudentName] = useState<string>("");

  const triggerFaceRegistration = (studentId: string, studentName: string) => {
    if (!isSuperAdmin) {
      alert("Access Denied: Only Super Admin can register or modify student Face ID biometrics.");
      return;
    }
    setFaceModalStudentId(studentId);
    setFaceModalStudentName(studentName);
    setIsFaceModalOpen(true);
  };

  const fetchStudents = async (forceLoading = false) => {
    if (forceLoading || (!students.length && !memoryStudentsCache)) {
      setLoading(true);
    }
    try {
      const res = await fetch('/api/students');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch students');
      const list = data.students || [];
      memoryStudentsCache = list;
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("medattend_students_cache", JSON.stringify(list));
        } catch {}
      }
      setStudents(list);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanRoll = newStudent.student_roll.trim();
    if (!cleanRoll) {
      setFormError("Roll Number is required.");
      return;
    }

    // Immediate local duplicate check
    if (duplicateStudent) {
      setFormError(`Duplicate Roll Number! Roll "${duplicateStudent.student_roll}" is already registered to "${duplicateStudent.full_name}" (${duplicateStudent.academic_year || 'N/A'}).`);
      return;
    }

    setIsSubmitting(true);

    const cleanPhone = newStudent.parent_phone ? cleanPhoneNumber(newStudent.parent_phone) : null;
    const cleanEmail = encodeStudentEmail(cleanRoll, cleanPhone || undefined);

    // Strip any existing parenthesized groups/batches to prevent duplicate stacking like "(Group A) (Group B)"
    const cleanBaseYear = (newStudent.academic_year || '1st Year')
      .replace(/\s*\(((?:Group|Batch)\s*[^)]+)\)/gi, '')
      .replace(/\s*\([^)]*\)/gi, '')
      .trim() || '1st Year';

    const combinedYear = newStudent.sub_batch && newStudent.sub_batch !== 'All'
      ? `${cleanBaseYear} (${newStudent.sub_batch})`
      : cleanBaseYear;

    try {
      const payload = {
        student_roll: cleanRoll,
        full_name: newStudent.full_name.trim(),
        email: cleanEmail,
        academic_year: combinedYear,
        parent_phone: cleanPhone,
      };

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/students/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to save student.');
      }

      closeModal();
      fetchStudents(); // Refresh the list
    } catch (error: any) {
      console.error('Error saving student:', error);
      setFormError(error.message || 'Failed to save student.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isSuperAdmin) {
      alert("Access Denied: Only Super Admin can delete student records.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this student? This will also remove their attendance records.")) return;

    try {
      const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete student.');

      setSelectedIds(prev => prev.filter(item => item !== id));
      fetchStudents();
    } catch (error: any) {
      console.error('Error deleting student:', error);
      alert(error.message || 'Failed to delete student.');
    }
  };

  const confirmResetPin = async () => {
    if (!resetPinTarget) return;
    setIsResettingPin(true);
    setResetPinSuccess(null);
    setResetPinError(null);
    setResetPinTempPin(null);
    setPinCopied(false);

    try {
      const res = await fetch(`/api/students/${resetPinTarget.id}/reset-pin`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to reset PIN.");
      }
      setResetPinTempPin(data.tempPin || null);
      setResetPinSuccess(data.message || `Temporary activation PIN generated successfully.`);
      fetchStudents();
    } catch (err: any) {
      console.error("Error resetting student PIN:", err);
      setResetPinError(err.message || "Failed to reset PIN.");
    } finally {
      setIsResettingPin(false);
    }
  };

  const confirmRevokeBiometric = async () => {
    if (!revokeBiometricTarget) return;
    setIsRevokingBiometric(true);
    setRevokeBiometricSuccess(null);
    setRevokeBiometricError(null);

    try {
      const res = await fetch(`/api/students/${revokeBiometricTarget.id}/revoke-biometrics`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to revoke biometrics.");
      }
      setRevokeBiometricSuccess(`Facial biometric template erased and consent revoked.`);
      fetchStudents();
      setTimeout(() => {
        setRevokeBiometricTarget(null);
        setRevokeBiometricSuccess(null);
        setRevokeBiometricError(null);
      }, 1500);
    } catch (err: any) {
      console.error("Error revoking biometrics:", err);
      setRevokeBiometricError(err.message || "Failed to revoke biometrics.");
    } finally {
      setIsRevokingBiometric(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!isSuperAdmin) {
      alert("Access Denied: Only Super Admin can delete student records.");
      return;
    }
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const confirmMsg = `Are you sure you want to delete ${count} selected student${count > 1 ? 's' : ''}? This will permanently remove their face biometrics and attendance records.`;
    if (!window.confirm(confirmMsg)) return;

    setIsBulkDeleting(true);
    try {
      const res = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete selected students.');

      setSelectedIds([]);
      await fetchStudents();
    } catch (error: any) {
      console.error('Error during bulk deletion:', error);
      alert(error.message || 'Failed to delete selected students. Check console for details.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const openEnrollModal = () => {
    setEditingId(null);
    setFormError(null);
    setNewStudent({ student_roll: '', full_name: '', email: '', academic_year: activeView || '1st Year', sub_batch: 'All', parent_phone: '' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormError(null);
    setNewStudent({ student_roll: '', full_name: '', email: '', academic_year: activeView || '1st Year', sub_batch: 'All', parent_phone: '' });
  };

  const filteredStudents = students
    .filter(student => {
      const matchesSearch = student.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.student_roll?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesYear = activeView ? (student.academic_year?.startsWith(activeView) ?? false) : true;
      const matchesSubBatch = activeSubBatch === 'All'
        ? true
        : ((student.academic_year?.includes(`(${activeSubBatch})`) ||
          (activeSubBatch.startsWith('Group') && student.academic_year?.includes(`(${activeSubBatch.replace('Group', 'Batch')})`))) ?? false);
      return matchesSearch && matchesYear && matchesSubBatch;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortField === 'student_roll') {
        const rollA = a.student_roll || '';
        const rollB = b.student_roll || '';
        comparison = rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortField === 'full_name') {
        const nameA = a.full_name || '';
        const nameB = b.full_name || '';
        comparison = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      } else if (sortField === 'academic_year') {
        const yearA = a.academic_year || '';
        const yearB = b.academic_year || '';
        comparison = yearA.localeCompare(yearB, undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const isAllSelected = filteredStudents.length > 0 && filteredStudents.every(s => selectedIds.includes(s.id));
  const isSomeSelected = filteredStudents.some(s => selectedIds.includes(s.id)) && !isAllSelected;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const filteredIdSet = new Set(filteredStudents.map(s => s.id));
      setSelectedIds(prev => prev.filter(id => !filteredIdSet.has(id)));
    } else {
      const newSelected = new Set(selectedIds);
      filteredStudents.forEach(s => newSelected.add(s.id));
      setSelectedIds(Array.from(newSelected));
    }
  };

  const handleToggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleExportCSV = () => {
    // If specific students are selected, export only selected ones, otherwise export all in view
    const listToExport = selectedIds.length > 0
      ? students.filter(s => selectedIds.includes(s.id))
      : (filteredStudents.length > 0 ? filteredStudents : students);

    if (listToExport.length === 0) {
      alert("No students to export.");
      return;
    }
    const headers = ["Roll Number", "Full Name", "Academic Year", "WhatsApp", "Face Data Status"];
    const rows = listToExport.map(s => [
      `"${s.student_roll || ''}"`,
      `"${s.full_name || ''}"`,
      `"${s.academic_year || ''}"`,
      `"${getParentPhone(s) || ''}"`,
      `"${s.face_encoding ? 'Active' : 'Missing'}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `students_${(activeView || 'all').toLowerCase().replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const yearFolders = [
    { id: "1st Year", title: "First Year", iconBg: "bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400", glow: "bg-blue-500" },
    { id: "2nd Year", title: "Second Year", iconBg: "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400", glow: "bg-emerald-500" },
    { id: "3rd Year", title: "Third Year", iconBg: "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400", glow: "bg-amber-500" },
    { id: "4th Year", title: "Fourth Year", iconBg: "bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400", glow: "bg-purple-500" },
  ];

  if (!isLoading && user?.role === "Faculty") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-4">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Access Restricted</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md">
          Student Directory is restricted to Administrators. Redirecting to Dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full relative">
        <StudentProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          student={selectedProfileStudent}
        />

        <FaceRegistrationModal
          isOpen={isFaceModalOpen}
          onClose={() => setIsFaceModalOpen(false)}
          studentId={faceModalStudentId}
          studentName={faceModalStudentName}
          onSuccess={() => fetchStudents()}
        />

        <BulkImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          defaultAcademicYear={activeView}
          onSuccess={() => fetchStudents()}
        />

        {/* Header */}
        {!activeView ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Student Directory</h1>
              <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">Select an academic year folder to manage student profiles and facial data.</p>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto">
              <button
                onClick={() => setIsImportModalOpen(true)}
                type="button"
                className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-xl bg-white dark:bg-gray-900 px-3.5 py-2 text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <FileSpreadsheet className="h-4 w-4 mr-1.5 sm:mr-2 text-indigo-600 dark:text-indigo-400" />
                Import Excel / CSV
              </button>
              <button
                onClick={openEnrollModal}
                type="button"
                className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-xl bg-indigo-600 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
              >
                <UserPlus className="h-4 w-4 mr-1.5 sm:mr-2" />
                Enroll Student
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
            <div>
              <button
                onClick={() => { setActiveView(null); setSearchTerm(""); }}
                className="group mb-3 sm:mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-gray-900/80 hover:bg-indigo-50/70 dark:hover:bg-slate-800/90 border border-gray-200/90 dark:border-gray-800 hover:border-indigo-300/80 dark:hover:border-indigo-500/40 text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-300 backdrop-blur-md shadow-xs hover:shadow-sm transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <div className="flex items-center justify-center w-5 h-5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-950/70 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
                </div>
                <span>Back to Folders</span>
              </button>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Directory: {activeView}</h1>
              <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">Manage students inside the {activeView} cohort.</p>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto">
              <button
                onClick={() => setIsImportModalOpen(true)}
                type="button"
                className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-xl bg-white dark:bg-gray-900 px-3 py-2 text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <FileSpreadsheet className="h-4 w-4 mr-1.5 sm:mr-2 text-indigo-600 dark:text-indigo-400" />
                Import Excel
              </button>
              <button
                onClick={handleExportCSV}
                type="button"
                className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-xl bg-white dark:bg-gray-900 px-3 py-2 text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <FileDown className="h-4 w-4 mr-1.5 sm:mr-2 text-gray-500 dark:text-gray-400" />
                Export CSV
              </button>
              <button
                onClick={openEnrollModal}
                type="button"
                className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
              >
                <UserPlus className="h-4 w-4 mr-1.5 sm:mr-2" />
                Enroll Student
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        {!activeView ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {yearFolders.map((folder) => {
              const count = students.filter(s => s.academic_year?.startsWith(folder.id)).length;
              return (
                <div
                  key={folder.id}
                  onClick={() => {
                    setSelectedIds([]);
                    setActiveSubBatch('All');
                    setActiveView(folder.id);
                  }}
                  className="group relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 sm:p-6 hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden"
                >
                  <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full opacity-10 transition-transform duration-500 group-hover:scale-150 ${folder.glow}`}></div>
                  <div className="flex items-center justify-between mb-4 relative z-10">
                    <div className={`p-3 rounded-xl ${folder.iconBg} flex items-center justify-center shadow-inner`}>
                      <Folder className="w-7 h-7 sm:w-8 sm:h-8" />
                    </div>
                    <div className="flex items-center space-x-1 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2.5 sm:px-3 py-1 rounded-full border border-gray-100 dark:border-gray-700 min-w-[3rem] justify-center">
                      <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 text-gray-400" />
                      {loading && students.length === 0 ? (
                        <span className="inline-block w-4 h-3.5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      ) : (
                        <span>{count}</span>
                      )}
                    </div>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white relative z-10">{folder.title}</h3>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {/* Search Bar & Selection Summary (Inside Folder) */}
            <div className="bg-white dark:bg-gray-900 p-3 sm:p-4 rounded-t-xl border border-gray-200 dark:border-gray-800 border-b-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 transition-colors">
              <div className="relative flex-1 max-w-md">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Search className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  type="text"
                  className="block w-full rounded-xl border-0 py-2 pl-9 sm:pl-10 pr-3 text-gray-900 dark:text-white bg-white dark:bg-gray-800 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-xs sm:text-sm sm:leading-6 transition-colors"
                  placeholder={`Search inside ${activeView}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Sub-Group Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {['All', 'Group A', 'Group B', 'Group C'].map((b) => {
                  const bCount = students.filter(s => {
                    if (!s.academic_year?.startsWith(activeView)) return false;
                    if (b === 'All') return true;
                    return s.academic_year?.includes(`(${b})`) || (b.startsWith('Group') && s.academic_year?.includes(`(${b.replace('Group', 'Batch')})`));
                  }).length;
                  const isSelected = activeSubBatch === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setActiveSubBatch(b)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${isSelected
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                    >
                      <span>{b === 'All' ? 'All Group' : b}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-indigo-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                        {loading && students.length === 0 ? "..." : bCount}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <span className="text-xs sm:text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                    {selectedIds.length} student{selectedIds.length > 1 ? 's' : ''} selected
                  </span>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      disabled={isBulkDeleting}
                      className="inline-flex items-center justify-center rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
                    >
                      {isBulkDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Delete Selected
                    </button>
                  )}
                </div>
              )}

              <span className="text-[11px] text-gray-400 sm:hidden ml-auto shrink-0">Scroll →</span>
            </div>

            {/* Data Table */}
            <div className="bg-white dark:bg-gray-900 rounded-b-xl border border-gray-200 dark:border-gray-800 shadow-sm transition-colors">
              <div className="overflow-x-auto min-h-[280px] pb-24">
                <table className="min-w-[720px] w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 sm:pl-6 pr-3 w-12 text-left">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            ref={(el) => {
                              if (el) el.indeterminate = isSomeSelected;
                            }}
                            checked={isAllSelected}
                            onChange={handleToggleSelectAll}
                            className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900 cursor-pointer transition-all"
                            title={isAllSelected ? "Deselect All" : "Select All"}
                          />
                        </div>
                      </th>
                      <th
                        scope="col"
                        onClick={() => handleSort('student_roll')}
                        className="py-3.5 px-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-300 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none group transition-colors"
                        title="Click to sort by Roll Number"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Roll Number</span>
                          {sortField === 'student_roll' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th
                        scope="col"
                        onClick={() => handleSort('full_name')}
                        className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-300 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none group transition-colors"
                        title="Click to sort by Name"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Name</span>
                          {sortField === 'full_name' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th
                        scope="col"
                        onClick={() => handleSort('academic_year')}
                        className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-300 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none group transition-colors"
                        title="Click to sort by Academic Year"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Academic Year</span>
                          {sortField === 'academic_year' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-300">
                        WhatsApp
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-300">
                        Face Data
                      </th>
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6 text-right text-sm font-semibold text-gray-900 dark:text-gray-300">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                          Loading students...
                        </td>
                      </tr>
                    ) : filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                          No students found. Enroll a new student to get started!
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((student, idx) => {
                        const isSelected = selectedIds.includes(student.id);
                        const phone = getParentPhone(student);
                        return (
                          <tr
                            key={student.id}
                            className={`transition-colors cursor-pointer ${isSelected
                              ? 'bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100/70 dark:hover:bg-indigo-950/60'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              }`}
                            onClick={(e) => {
                              const target = e.target as HTMLElement;
                              if (!target.closest('.actions-cell') && !target.closest('input[type="checkbox"]')) {
                                setSelectedProfileStudent(student);
                                setIsProfileModalOpen(true);
                              }
                            }}
                          >
                            <td className="whitespace-nowrap py-4 pl-4 sm:pl-6 pr-3 w-12" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelect(student.id)}
                                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900 cursor-pointer transition-all"
                                />
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                              {student.student_roll}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                              <div className="flex items-center">
                                <div className="h-8 w-8 flex-shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-semibold text-xs mr-3 uppercase">
                                  {student.full_name?.substring(0, 2)}
                                </div>
                                <span className="font-medium text-gray-900 dark:text-gray-100">{student.full_name}</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                              <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-400/20">
                                {student.academic_year || 'N/A'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                              {phone ? (
                                <a
                                  href={`https://wa.me/${phone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-mono font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                                  title="Chat on WhatsApp"
                                >
                                  <MessageSquare className="w-3 h-3 text-emerald-500" />
                                  <span>{formatPhoneDisplay(phone)}</span>
                                </a>
                              ) : (
                                <span className="text-gray-400 dark:text-gray-600 text-xs italic">Not set</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${student.face_encoding ? 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-900/30 dark:text-indigo-400 dark:ring-indigo-400/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-400/20'
                                }`}>
                                {student.face_encoding ? 'Active' : 'Missing'}
                              </span>
                            </td>
                            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 actions-cell">
                              <div className="flex justify-end items-center gap-2">
                                {isSuperAdmin ? (
                                  <button
                                    onClick={() => triggerFaceRegistration(student.id, student.full_name)}
                                    className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 mr-2 transition-colors"
                                    title="Enroll or update student face biometrics"
                                  >
                                    <UploadCloud className="w-4 h-4 mr-1" /> {student.face_encoding ? 'Update Face ID' : 'Setup Face ID'}
                                  </button>
                                ) : (
                                  <span
                                    className="inline-flex items-center text-xs text-gray-400 dark:text-gray-500 mr-2 gap-1 select-none"
                                    title="Biometrics registration is restricted to Super Admin"
                                  >
                                    <Lock className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="hidden sm:inline">Admin Managed</span>
                                  </span>
                                )}

                                {/* Actions Dropdown */}
                                <div className="relative inline-block text-left">
                                  <button
                                    onClick={() => setOpenDropdownId(openDropdownId === student.id ? null : student.id)}
                                    className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    title="More options"
                                  >
                                    <MoreHorizontal className="h-5 w-5" />
                                  </button>

                                  {openDropdownId === student.id && (
                                    <>
                                      <div className="fixed inset-0 z-40" onClick={() => setOpenDropdownId(null)}></div>
                                      <div className={`absolute right-0 z-50 w-40 rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 py-1.5 ring-1 ring-black/10 focus:outline-none ${filteredStudents.length > 3 && idx >= filteredStudents.length - 2
                                          ? 'bottom-full mb-2 origin-bottom-right'
                                          : 'top-full mt-1.5 origin-top-right'
                                        }`}>
                                        <button
                                          onClick={() => {
                                            const rawYear = student.academic_year || '1st Year';
                                            // Extract all parenthesized groups or batches
                                            const matches = [...rawYear.matchAll(/\(((?:Group|Batch)\s*[^)]+)\)/gi)];
                                            let parsedBatch = 'All';
                                            if (matches.length > 0) {
                                              const lastMatch = matches[matches.length - 1][1].trim();
                                              parsedBatch = lastMatch.replace(/^Batch\s*/i, 'Group ');
                                            }
                                            // Strip ALL (Group X) / (Batch X) parentheticals to extract pure base academic year
                                            const baseYear = rawYear.replace(/\s*\(((?:Group|Batch)\s*[^)]+)\)/gi, '').replace(/\s*\([^)]*\)/gi, '').trim() || '1st Year';

                                            setNewStudent({
                                              student_roll: student.student_roll || '',
                                              full_name: student.full_name || '',
                                              email: student.email || '',
                                              academic_year: baseYear,
                                              sub_batch: parsedBatch,
                                              parent_phone: getParentPhone(student)
                                            });
                                            setEditingId(student.id);
                                            setFormError(null);
                                            setIsModalOpen(true);
                                            setOpenDropdownId(null);
                                          }}
                                          className="text-gray-700 dark:text-gray-200 w-full text-left px-3.5 py-2 text-xs sm:text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center transition-colors font-medium cursor-pointer"
                                        >
                                          <Edit2 className="w-4 h-4 mr-2.5 text-gray-400 dark:text-gray-500" />
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => {
                                            setResetPinTarget({ id: student.id, name: student.full_name, roll: student.student_roll });
                                            setResetPinSuccess(null);
                                            setResetPinError(null);
                                            setOpenDropdownId(null);
                                          }}
                                          className="text-amber-600 dark:text-amber-400 w-full text-left px-3.5 py-2 text-xs sm:text-sm hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-300 flex items-center transition-colors font-medium cursor-pointer"
                                        >
                                          <KeyRound className="w-4 h-4 mr-2.5 text-amber-500" />
                                          Reset PIN
                                        </button>
                                        {isSuperAdmin && student.face_encoding && (
                                          <button
                                            onClick={() => {
                                              setRevokeBiometricTarget({ id: student.id, name: student.full_name, roll: student.student_roll });
                                              setRevokeBiometricSuccess(null);
                                              setRevokeBiometricError(null);
                                              setOpenDropdownId(null);
                                            }}
                                            className="text-rose-600 dark:text-rose-400 w-full text-left px-3.5 py-2 text-xs sm:text-sm hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:text-rose-700 dark:hover:text-rose-300 flex items-center transition-colors font-medium cursor-pointer"
                                            title="Revoke DPDP biometric consent and erase face template"
                                          >
                                            <UserX className="w-4 h-4 mr-2.5 text-rose-500" />
                                            Remove Face ID
                                          </button>
                                        )}
                                        {isSuperAdmin && (
                                          <button
                                            onClick={() => {
                                              handleDelete(student.id);
                                              setOpenDropdownId(null);
                                            }}
                                            className="text-red-600 dark:text-red-400 w-full text-left px-3.5 py-2 text-xs sm:text-sm hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center transition-colors font-medium cursor-pointer"
                                          >
                                            <Trash2 className="w-4 h-4 mr-2.5 text-red-500" />
                                            Delete
                                          </button>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Floating Batch Action Toolbar */}
            {selectedIds.length > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[92%] sm:w-auto">
                <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3 bg-gray-900/95 dark:bg-gray-800/95 backdrop-blur-md text-white px-4 sm:px-6 py-3 rounded-2xl shadow-2xl border border-gray-700/60 ring-1 ring-white/10">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white shadow-sm">
                      {selectedIds.length}
                    </span>
                    <span className="text-xs sm:text-sm font-medium text-gray-200">
                      Student{selectedIds.length > 1 ? 's' : ''} selected
                    </span>
                  </div>

                  <div className="h-4 w-px bg-gray-700 hidden sm:block"></div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="inline-flex items-center px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-200 hover:text-white hover:bg-gray-800 dark:hover:bg-gray-700/70 rounded-xl transition-colors"
                      title="Export selected students to CSV"
                    >
                      <FileDown className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                      Export ({selectedIds.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 dark:hover:bg-gray-700/70 rounded-xl transition-colors"
                    >
                      Clear
                    </button>

                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={handleBulkDelete}
                        disabled={isBulkDeleting}
                        className="inline-flex items-center justify-center px-4 py-1.5 text-xs sm:text-sm font-semibold text-white bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-xl shadow-md transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed gap-1.5"
                      >
                        {isBulkDeleting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Deleting...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4" />
                            <span>Delete Selected ({selectedIds.length})</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Enroll/Edit Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{editingId ? 'Edit Student' : 'Enroll New Student'}</h2>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-rose-800 dark:text-rose-200">Error:</p>
                    <p className="mt-0.5 text-rose-700 dark:text-rose-300">{formError}</p>
                  </div>
                  <button type="button" onClick={() => setFormError(null)} className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveStudent} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="roll" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Roll Number / ID
                    </label>
                    {duplicateStudent && (
                      <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Already Registered
                      </span>
                    )}
                  </div>
                  <div className="relative mt-1">
                    <input
                      id="roll"
                      required
                      type="text"
                      className={`block w-full rounded-md border-0 py-2 sm:text-sm sm:leading-6 px-3 transition-colors ${duplicateStudent
                          ? 'bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500 focus:ring-rose-500 placeholder:text-rose-400'
                          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600'
                        }`}
                      value={newStudent.student_roll}
                      onChange={e => {
                        setNewStudent({ ...newStudent, student_roll: e.target.value });
                        if (formError) setFormError(null);
                      }}
                      placeholder="e.g. STU-001"
                    />
                  </div>

                  {duplicateStudent && (
                    <div className="mt-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <div className="leading-tight">
                        <p className="font-semibold text-rose-800 dark:text-rose-200">
                          This Roll Number is already registered!
                        </p>
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                          Student: <strong className="font-semibold text-rose-900 dark:text-rose-100">{duplicateStudent.full_name}</strong> • Batch: <span>{duplicateStudent.academic_year || 'N/A'}</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
                  <input
                    id="name"
                    required
                    type="text"
                    className="mt-1 block w-full rounded-md border-0 bg-white dark:bg-gray-800 py-2 text-gray-900 dark:text-white ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                    value={newStudent.full_name}
                    onChange={e => setNewStudent({ ...newStudent, full_name: e.target.value })}
                    placeholder="e.g. Emily Chen"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="academic_year" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Academic Year</label>
                    <select
                      id="academic_year"
                      required
                      disabled={!!activeView}
                      className={`mt-1 block w-full rounded-md border-0 py-2 pl-3 pr-10 ring-1 ring-inset focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors ${activeView ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 ring-gray-200 dark:ring-gray-700 cursor-not-allowed' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white ring-gray-300 dark:ring-gray-700'}`}
                      value={newStudent.academic_year}
                      onChange={e => setNewStudent({ ...newStudent, academic_year: e.target.value })}
                    >
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="sub_batch" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Sub-Group / Section</label>
                    <select
                      id="sub_batch"
                      className="mt-1 block w-full rounded-md border-0 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-gray-900 dark:text-white ring-1 ring-inset ring-gray-300 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      value={newStudent.sub_batch}
                      onChange={e => setNewStudent({ ...newStudent, sub_batch: e.target.value })}
                    >
                      <option value="All">All Group / Unassigned</option>
                      <option value="Group A">Group A</option>
                      <option value="Group B">Group B</option>
                      <option value="Group C">Group C</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="parent_phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between">
                    <span>WhatsApp Number</span>
                    <span className="text-[11px] text-emerald-500 font-normal">Optional</span>
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="parent_phone"
                      type="tel"
                      className="block w-full rounded-md border-0 bg-white dark:bg-gray-800 py-2 text-gray-900 dark:text-white ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                      value={newStudent.parent_phone}
                      onChange={e => setNewStudent({ ...newStudent, parent_phone: e.target.value })}
                      placeholder="e.g. +91 98765 43210"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Used for automated WhatsApp absentee & attendance alert notices.</p>
                </div>

                <div className="mt-6 flex justify-end space-x-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-md bg-white dark:bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-200 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !!duplicateStudent}
                    className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSubmitting ? 'Saving...' : duplicateStudent ? 'Duplicate Roll Number' : (editingId ? 'Save Changes' : 'Save Student')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modern Centered Reset PIN Modal */}
        {resetPinTarget && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative overflow-hidden text-white animate-in zoom-in-95 duration-200">
              {/* Top ambient glow */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 blur-[80px] rounded-full pointer-events-none" />

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  if (!isResettingPin) {
                    setResetPinTarget(null);
                    setResetPinSuccess(null);
                    setResetPinError(null);
                    setResetPinTempPin(null);
                    setPinCopied(false);
                  }
                }}
                disabled={isResettingPin}
                className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors p-1.5 rounded-xl hover:bg-slate-800 cursor-pointer disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3.5 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10 shrink-0">
                  <KeyRound className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white tracking-tight">Reset Portal PIN</h3>
                  <p className="text-xs text-slate-400">Student Account Recovery</p>
                </div>
              </div>

              {resetPinSuccess && resetPinTempPin ? (
                <div className="space-y-4 my-2 animate-in zoom-in-95">
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
                    <div className="flex items-center gap-2 mb-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                      <KeyRound className="w-4 h-4 text-amber-400" />
                      <span>One-Time Activation PIN Generated</span>
                    </div>
                    <p className="text-xs text-slate-300 mb-3">
                      Share this temporary 6-digit PIN with <strong className="text-white">{resetPinTarget.name}</strong> (Roll: {resetPinTarget.roll}). The student must use this PIN to log in and set their secret permanent PIN.
                    </p>
                    
                    <div className="flex items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-amber-500/30">
                      <span className="font-mono text-2xl font-black text-amber-400 tracking-widest pl-2">
                        {resetPinTempPin}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (resetPinTempPin) {
                            navigator.clipboard.writeText(resetPinTempPin);
                            setPinCopied(true);
                            setTimeout(() => setPinCopied(false), 2000);
                          }
                        }}
                        className="py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        {pinCopied ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <span>Copy PIN</span>
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setResetPinTarget(null);
                      setResetPinSuccess(null);
                      setResetPinError(null);
                      setResetPinTempPin(null);
                      setPinCopied(false);
                    }}
                    className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    Done &amp; Close
                  </button>
                </div>
              ) : (
                <>
                  {resetPinError && (
                    <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-start gap-2.5 mb-4 text-xs animate-in zoom-in-95">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>{resetPinError}</span>
                    </div>
                  )}

                  <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 mb-4">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-400">Student Name</span>
                      <span className="font-bold text-white text-sm">{resetPinTarget.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Roll Number</span>
                      <span className="font-mono font-bold text-amber-400 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                        {resetPinTarget.roll}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed mb-6">
                    Are you sure you want to reset this student&apos;s security PIN? This will clear their current PIN and restore initial login access so they can set a fresh PIN upon their next login.
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={isResettingPin}
                      onClick={() => {
                        setResetPinTarget(null);
                        setResetPinSuccess(null);
                        setResetPinError(null);
                        setResetPinTempPin(null);
                        setPinCopied(false);
                      }}
                      className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isResettingPin}
                      onClick={confirmResetPin}
                      className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isResettingPin ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                          <span>Resetting...</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4" />
                          <span>Confirm Reset</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* DPDP Biometric Revocation / Face Erasure Modal */}
        {revokeBiometricTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-7 shadow-2xl shadow-rose-950/20 text-left">
              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  if (!isRevokingBiometric) {
                    setRevokeBiometricTarget(null);
                    setRevokeBiometricSuccess(null);
                    setRevokeBiometricError(null);
                  }
                }}
                disabled={isRevokingBiometric}
                className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors p-1.5 rounded-xl hover:bg-slate-800 cursor-pointer disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3.5 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shadow-lg shadow-rose-500/10 shrink-0">
                  <UserX className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white tracking-tight">Remove Face ID & Revoke Consent</h3>
                  <p className="text-xs text-slate-400">DPDP Act 2023 Biometric Erasure</p>
                </div>
              </div>

              {revokeBiometricSuccess ? (
                <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-start gap-3 my-4 animate-in zoom-in-95">
                  <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="text-xs">
                    <p className="font-bold text-sm text-emerald-200">Biometric Template Erased</p>
                    <p className="mt-1 text-emerald-300/90">{revokeBiometricSuccess}</p>
                  </div>
                </div>
              ) : (
                <>
                  {revokeBiometricError && (
                    <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-start gap-2.5 mb-4 text-xs animate-in zoom-in-95">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>{revokeBiometricError}</span>
                    </div>
                  )}

                  <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 mb-4">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-400">Student Name</span>
                      <span className="font-bold text-white text-sm">{revokeBiometricTarget.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Roll Number</span>
                      <span className="font-mono font-bold text-rose-400 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20">
                        {revokeBiometricTarget.roll}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed mb-6">
                    Are you sure you want to erase this student&apos;s facial biometric template and revoke consent? This complies with DPDP Act 2023 Section 6(4). Their student account and past attendance logs will remain intact, and they can be re-enrolled at any time.
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={isRevokingBiometric}
                      onClick={() => {
                        setRevokeBiometricTarget(null);
                        setRevokeBiometricSuccess(null);
                        setRevokeBiometricError(null);
                      }}
                      className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isRevokingBiometric}
                      onClick={confirmRevokeBiometric}
                      className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs font-black shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isRevokingBiometric ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Erasing...</span>
                        </>
                      ) : (
                        <span>Erase Face ID</span>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
