/* eslint-disable */
"use client";

import { useState, useEffect, useRef } from "react";
import { Search, UserPlus, FileDown, MoreHorizontal, X, UploadCloud, Loader2, Edit2, Trash2, Folder, ArrowLeft, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Student } from "@/types/database";
import { StudentProfileModal } from "@/components/StudentProfileModal";

export default function StudentDirectory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeView, setActiveView] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploadingForId, setUploadingForId] = useState<string | null>(null);
  
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Profile Modal State
  const [selectedProfileStudent, setSelectedProfileStudent] = useState<Student | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Form State
  const [newStudent, setNewStudent] = useState({ student_roll: '', full_name: '', email: '', academic_year: '1st Year' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reference for the hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('created_at', { ascending: false });
        
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
    
    // Auto-generate email to satisfy database constraints since we removed it from UI
    const generatedEmail = `${newStudent.student_roll.toLowerCase().replace(/\s+/g, '')}@student.local`;
    
    try {
      if (editingId) {
        const { error } = await supabase
          .from('students')
          .update({
            student_roll: newStudent.student_roll,
            full_name: newStudent.full_name,
            email: generatedEmail,
            academic_year: newStudent.academic_year,
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
            academic_year: newStudent.academic_year,
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
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
      fetchStudents();
    } catch (error) {
      console.error('Error deleting student:', error);
      alert('Failed to delete student.');
    }
  };

  const triggerFileUpload = (studentId: string) => {
    setSelectedStudentId(studentId);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStudentId) return;

    setUploadingForId(selectedStudentId);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/enroll-face/${selectedStudentId}`, {
        method: 'POST',
        body: formData,
        headers: {
          "ngrok-skip-browser-warning": "69420"
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to upload photo');
      }

      await fetchStudents(); // Refresh the list to show Active status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error uploading face data:', error);
      alert(error.message || 'Failed to upload photo. Check console.');
    } finally {
      setUploadingForId(null);
      setSelectedStudentId(null);
      if (e.target) e.target.value = ''; // Reset input
    }
  };

  const openEnrollModal = () => {
    setEditingId(null);
    setNewStudent({ student_roll: '', full_name: '', email: '', academic_year: activeView || '1st Year' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setNewStudent({ student_roll: '', full_name: '', email: '', academic_year: activeView || '1st Year' });
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch = student.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          student.student_roll?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesYear = activeView ? student.academic_year === activeView : true;
    return matchesSearch && matchesYear;
  });

  const yearFolders = [
    { id: "1st Year", title: "First Year", description: "Freshman Cohort", color: "bg-blue-500", shadow: "shadow-blue-500/20" },
    { id: "2nd Year", title: "Second Year", description: "Sophomore Cohort", color: "bg-emerald-500", shadow: "shadow-emerald-500/20" },
    { id: "3rd Year", title: "Third Year", description: "Junior Cohort", color: "bg-amber-500", shadow: "shadow-amber-500/20" },
    { id: "4th Year", title: "Fourth Year", description: "Senior Cohort", color: "bg-purple-500", shadow: "shadow-purple-500/20" },
  ];

  return (
    <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full relative">
      <StudentProfileModal 
        isOpen={isProfileModalOpen} 
        onClose={() => setIsProfileModalOpen(false)} 
        student={selectedProfileStudent} 
      />

      {/* Hidden file input for uploading face images */}
      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
      />

      {/* Header */}
      {!activeView ? (
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Student Directory</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Select an academic year folder to manage student profiles and facial data.</p>
        </div>
      ) : (
        <div className="sm:flex sm:items-center sm:justify-between mb-8">
          <div>
            <button 
              onClick={() => { setActiveView(null); setSearchTerm(""); }}
              className="mb-4 inline-flex items-center text-sm font-medium text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Folders
            </button>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Directory: {activeView}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage students inside the {activeView} cohort.</p>
          </div>
          <div className="mt-4 sm:mt-0 sm:flex sm:space-x-3">
            <button type="button" className="inline-flex items-center justify-center rounded-md bg-white dark:bg-gray-900 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <FileDown className="h-4 w-4 mr-2 text-gray-500 dark:text-gray-400" />
              Export CSV
            </button>
            <button 
              onClick={openEnrollModal}
              type="button" 
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Enroll Student
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {!activeView ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {yearFolders.map((folder) => {
            const count = students.filter(s => s.academic_year === folder.id).length;
            return (
              <div 
                key={folder.id}
                onClick={() => setActiveView(folder.id)}
                className="group relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden"
              >
                <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full opacity-10 transition-transform duration-500 group-hover:scale-150 ${folder.color}`}></div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <div className={`p-3 rounded-xl ${folder.color} bg-opacity-10 dark:bg-opacity-20`}>
                    <Folder className={`w-8 h-8 ${folder.color.replace('bg-', 'text-')}`} />
                  </div>
                  <div className="flex items-center space-x-1 text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-100 dark:border-gray-700">
                    <Users className="w-4 h-4 mr-1" />
                    {count}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1 relative z-10">{folder.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 relative z-10">{folder.description}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {/* Search Bar (Inside Folder) */}
          <div className="bg-white dark:bg-gray-900 p-4 rounded-t-xl border border-gray-200 dark:border-gray-800 border-b-0 flex items-center transition-colors">
            <div className="relative flex-1 max-w-md">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </div>
              <input
                type="text"
                className="block w-full rounded-md border-0 py-2 pl-10 text-gray-900 dark:text-white bg-white dark:bg-gray-800 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors"
                placeholder={`Search inside ${activeView}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-gray-900 rounded-b-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden pb-[100px] -mb-[100px] transition-colors">
        <div className="overflow-x-visible">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-300 sm:pl-6">
                  Roll Number
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-300">
                  Name
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-300">
                  Academic Year
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
                  <td colSpan={5} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading students...
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No students found. Enroll a new student to get started!
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr 
                    key={student.id} 
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (!target.closest('.actions-cell')) {
                        setSelectedProfileStudent(student);
                        setIsProfileModalOpen(true);
                      }
                    }}
                  >
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-gray-100 sm:pl-6">
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
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        student.face_encoding ? 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-900/30 dark:text-indigo-400 dark:ring-indigo-400/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-400/20'
                      }`}>
                        {student.face_encoding ? 'Active' : 'Missing'}
                      </span>
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 actions-cell">
                      <div className="flex justify-end items-center gap-2">
                        <button 
                          onClick={() => triggerFileUpload(student.id)}
                          disabled={uploadingForId === student.id}
                          className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 disabled:opacity-50 mr-2 transition-colors"
                        >
                          {uploadingForId === student.id ? (
                            <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Uploading...</>
                          ) : (
                            <><UploadCloud className="w-4 h-4 mr-1" /> {student.face_encoding ? 'Update Face' : 'Upload Face'}</>
                          )}
                        </button>
                        
                        {/* Actions Dropdown */}
                        <div className="relative inline-block text-left">
                          <button 
                            onClick={() => setOpenDropdownId(openDropdownId === student.id ? null : student.id)}
                            className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <MoreHorizontal className="h-5 w-5" />
                          </button>

                          {openDropdownId === student.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownId(null)}></div>
                              <div className="absolute right-0 z-20 mt-2 w-36 origin-top-right rounded-md bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                                <div className="py-1">
                                  <button
                                    onClick={() => {
                                      setNewStudent({ 
                                        student_roll: student.student_roll || '', 
                                        full_name: student.full_name || '', 
                                        email: student.email || '',
                                        academic_year: student.academic_year || '1st Year'
                                      });
                                      setEditingId(student.id);
                                      setIsModalOpen(true);
                                      setOpenDropdownId(null);
                                    }}
                                    className="text-gray-700 dark:text-gray-200 w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center transition-colors"
                                  >
                                    <Edit2 className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400" />
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleDelete(student.id);
                                      setOpenDropdownId(null);
                                    }}
                                    className="text-red-600 dark:text-red-400 w-full text-left px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
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
                  onChange={e => setNewStudent({...newStudent, student_roll: e.target.value})}
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
                  onChange={e => setNewStudent({...newStudent, full_name: e.target.value})}
                  placeholder="e.g. Emily Chen"
                />
              </div>
              <div>
                <label htmlFor="academic_year" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Academic Year</label>
                <select
                  id="academic_year"
                  required
                  disabled={!!activeView}
                  className={`mt-1 block w-full rounded-md border-0 py-2 pl-3 pr-10 ring-1 ring-inset focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors ${activeView ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 ring-gray-200 dark:ring-gray-700 cursor-not-allowed' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white ring-gray-300 dark:ring-gray-700'}`}
                  value={newStudent.academic_year}
                  onChange={e => setNewStudent({...newStudent, academic_year: e.target.value})}
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                </select>
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
