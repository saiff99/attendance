"use client";

import { useState, useEffect, useRef } from "react";
import { Search, UserPlus, FileDown, MoreHorizontal, X, UploadCloud, Loader2, Edit2, Trash2, Folder, ArrowLeft, Users, FileSpreadsheet, ArrowUpDown, ArrowUp, ArrowDown, MessageSquare, Phone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Student } from "@/types/database";
import { StudentProfileModal } from "@/components/StudentProfileModal";
import { FaceRegistrationModal } from "@/components/FaceRegistrationModal";
import { BulkImportModal } from "@/components/BulkImportModal";
import { getParentPhone, formatPhoneDisplay, encodeStudentEmail } from "@/lib/studentContact";

export default function StudentDirectory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeView, setActiveView] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  // Face Registration Modal State
  const [isFaceModalOpen, setIsFaceModalOpen] = useState(false);
  const [faceModalStudentId, setFaceModalStudentId] = useState<string>("");
  const [faceModalStudentName, setFaceModalStudentName] = useState<string>("");

  const triggerFaceRegistration = (studentId: string, studentName: string) => {
    setFaceModalStudentId(studentId);
    setFaceModalStudentName(studentName);
    setIsFaceModalOpen(true);
  };

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('student_roll', { ascending: true });

      if (error) throw error;
      setStudents(data || []);
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
    setIsSubmitting(true);

    // Encode parent WhatsApp phone into database email format safely
    const generatedEmail = encodeStudentEmail(newStudent.student_roll, newStudent.parent_phone);
    const combinedYear = newStudent.sub_batch && newStudent.sub_batch !== 'All'
      ? `${newStudent.academic_year} (${newStudent.sub_batch})`
      : newStudent.academic_year;

    try {
      if (editingId) {
        const { error } = await supabase
          .from('students')
          .update({
            student_roll: newStudent.student_roll,
            full_name: newStudent.full_name,
            email: generatedEmail,
            academic_year: combinedYear,
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('students')
          .insert([{
            student_roll: newStudent.student_roll,
            full_name: newStudent.full_name,
            email: generatedEmail,
            academic_year: combinedYear,
            face_encoding: null
          }]);

        if (error) throw error;
      }

      closeModal();
      fetchStudents(); // Refresh the list
    } catch (error) {
      console.error('Error saving student:', error);
      alert('Failed to save student. Check console for details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this student? This will also remove their attendance records.")) return;

    try {
      // Delete any dependent attendance records first
      await supabase.from('attendances').delete().eq('student_id', id);
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
      setSelectedIds(prev => prev.filter(item => item !== id));
      fetchStudents();
    } catch (error) {
      console.error('Error deleting student:', error);
      alert('Failed to delete student.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const confirmMsg = `Are you sure you want to delete ${count} selected student${count > 1 ? 's' : ''}? This will permanently remove their face biometrics and attendance records.`;
    if (!window.confirm(confirmMsg)) return;

    setIsBulkDeleting(true);
    try {
      // First delete dependent attendance records for all selected students
      await supabase.from('attendances').delete().in('student_id', selectedIds);
      const { error } = await supabase.from('students').delete().in('id', selectedIds);
      if (error) throw error;

      setSelectedIds([]);
      await fetchStudents();
    } catch (error) {
      console.error('Error during bulk deletion:', error);
      alert('Failed to delete selected students. Check console for details.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const openEnrollModal = () => {
    setEditingId(null);
    setNewStudent({ student_roll: '', full_name: '', email: '', academic_year: activeView || '1st Year', sub_batch: 'All', parent_phone: '' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
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
    const headers = ["Roll Number", "Full Name", "Academic Year", "Parent WhatsApp", "Face Data Status"];
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
                className="mb-3 sm:mb-4 inline-flex items-center text-xs sm:text-sm font-medium text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
              >
                <ArrowLeft className="mr-1 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Back to Folders
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
                    <div className="flex items-center space-x-1 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2.5 sm:px-3 py-1 rounded-full border border-gray-100 dark:border-gray-700">
                      <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" />
                      {count}
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span>{b === 'All' ? 'All Group' : b}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-indigo-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                        {bCount}
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
                </div>
              )}

              <span className="text-[11px] text-gray-400 sm:hidden ml-auto shrink-0">Scroll →</span>
            </div>

            {/* Data Table */}
            <div className="bg-white dark:bg-gray-900 rounded-b-xl border border-gray-200 dark:border-gray-800 shadow-sm transition-colors">
              <div className="overflow-x-auto min-h-[280px]">
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
                        Parent WhatsApp
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
                                <button
                                  onClick={() => triggerFaceRegistration(student.id, student.full_name)}
                                  className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 mr-2 transition-colors"
                                >
                                  <UploadCloud className="w-4 h-4 mr-1" /> {student.face_encoding ? 'Update Face ID' : 'Setup Face ID'}
                                </button>

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
                                      <div className="fixed inset-0 z-20" onClick={() => setOpenDropdownId(null)}></div>
                                      <div className={`absolute right-0 z-30 w-36 rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 py-1.5 ring-1 ring-black/5 focus:outline-none ${idx >= filteredStudents.length - 2 && filteredStudents.length > 3
                                          ? 'bottom-full mb-2 origin-bottom-right'
                                          : 'top-full mt-1.5 origin-top-right'
                                        }`}>
                                        <button
                                          onClick={() => {
                                            const rawYear = student.academic_year || '1st Year';
                                            const batchMatch = rawYear.match(/\((Batch [A-D])\)/i);
                                            const parsedBatch = batchMatch ? batchMatch[1] : 'All';
                                            const baseYear = rawYear.replace(/\s*\(Batch [A-D]\)/i, '').trim() || '1st Year';

                                            setNewStudent({
                                              student_roll: student.student_roll || '',
                                              full_name: student.full_name || '',
                                              email: student.email || '',
                                              academic_year: baseYear,
                                              sub_batch: parsedBatch,
                                              parent_phone: getParentPhone(student)
                                            });
                                            setEditingId(student.id);
                                            setIsModalOpen(true);
                                            setOpenDropdownId(null);
                                          }}
                                          className="text-gray-700 dark:text-gray-200 w-full text-left px-3.5 py-2 text-xs sm:text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center transition-colors font-medium"
                                        >
                                          <Edit2 className="w-4 h-4 mr-2.5 text-gray-400 dark:text-gray-500" />
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => {
                                            handleDelete(student.id);
                                            setOpenDropdownId(null);
                                          }}
                                          className="text-red-600 dark:text-red-400 w-full text-left px-3.5 py-2 text-xs sm:text-sm hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center transition-colors font-medium"
                                        >
                                          <Trash2 className="w-4 h-4 mr-2.5 text-red-500" />
                                          Delete
                                        </button>
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

              <form onSubmit={handleSaveStudent} className="space-y-4">
                <div>
                  <label htmlFor="roll" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Roll Number / ID</label>
                  <input
                    id="roll"
                    required
                    type="text"
                    className="mt-1 block w-full rounded-md border-0 bg-white dark:bg-gray-800 py-2 text-gray-900 dark:text-white ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                    value={newStudent.student_roll}
                    onChange={e => setNewStudent({ ...newStudent, student_roll: e.target.value })}
                    placeholder="e.g. STU-001"
                  />
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
                    <span>Parent WhatsApp Number</span>
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
                    disabled={isSubmitting}
                    className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 transition-colors"
                  >
                    {isSubmitting ? 'Saving...' : (editingId ? 'Save Changes' : 'Save Student')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
