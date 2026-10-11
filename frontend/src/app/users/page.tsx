"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Users, UserPlus, Shield, KeyRound, Search, RefreshCw, CheckCircle2,
  XCircle, MoreHorizontal, Trash2, Power, AlertTriangle, Eye, EyeOff,
  Sparkles, Lock, GraduationCap, Building2, UserCheck, ShieldAlert,
  BookOpen, Plus
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AcademicSubject, ACADEMIC_YEARS, DEFAULT_MBBS_SUBJECTS } from "@/lib/academicSubjects";

interface AppUser {
  id: string;
  username: string;
  full_name: string;
  email?: string;
  role: "Super Admin" | "Faculty";
  department?: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
  is_builtin?: boolean;
}

export default function UsersManagementPage() {
  const router = useRouter();
  const { user: currentUser, isLoading: isAuthLoading } = useAuth();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableReady, setTableReady] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

  // Form states
  const [newUser, setNewUser] = useState({
    username: "",
    full_name: "",
    email: "",
    department: "",
    role: "Faculty" as "Super Admin" | "Faculty",
    password: "",
  });
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Main Tab State: "users" or "subjects"
  const [activeMainTab, setActiveMainTab] = useState<"users" | "subjects">("users");

  // Subject Management State
  const [subjects, setSubjects] = useState<AcademicSubject[]>(DEFAULT_MBBS_SUBJECTS);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [selectedYearTab, setSelectedYearTab] = useState<string>("All");
  const [isAddSubjectModalOpen, setIsAddSubjectModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState({ academic_year: "1st Year", name: "", code: "" });
  const [isSubjectSubmitting, setIsSubjectSubmitting] = useState(false);
  const [subjectError, setSubjectError] = useState<string | null>(null);

  // Role Gate: Super Admin only
  useEffect(() => {
    if (!isAuthLoading && currentUser && currentUser.role !== "Super Admin") {
      router.push("/");
    }
  }, [currentUser, isAuthLoading, router]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (res.ok && data.success) {
        setUsers(data.users || []);
        setTableReady(data.tableReady !== false);
      } else {
        setFormError(data.error || "Failed to load users list.");
      }
    } catch (err: any) {
      console.error(err);
      setFormError("Network error while connecting to user service.");
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjects = async () => {
    setSubjectsLoading(true);
    try {
      const res = await fetch("/api/subjects");
      const data = await res.json();
      if (res.ok && data.success) {
        setSubjects(data.subjects || DEFAULT_MBBS_SUBJECTS);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubjectsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === "Super Admin") {
      fetchUsers();
      fetchSubjects();
    }
  }, [currentUser]);

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
      setActionSuccess(`Subject "${newSubject.name}" successfully added to ${newSubject.academic_year}!`);
      setIsAddSubjectModalOpen(false);
      setNewSubject({ academic_year: "1st Year", name: "", code: "" });
      fetchSubjects();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setSubjectError(err.message || "Failed to create subject.");
    } finally {
      setIsSubjectSubmitting(false);
    }
  };

  const handleDeleteSubject = async (subject: AcademicSubject) => {
    if (!window.confirm(`Are you sure you want to delete "${subject.name}" (${subject.academic_year})?`)) return;
    try {
      const res = await fetch(`/api/subjects/${subject.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to delete subject.");
        return;
      }
      setActionSuccess(`Subject "${subject.name}" deleted.`);
      fetchSubjects();
      setTimeout(() => setActionSuccess(null), 3000);
    } catch {
      alert("Failed to delete subject.");
    }
  };

  const handleToggleSubjectActive = async (subject: AcademicSubject) => {
    try {
      const res = await fetch(`/api/subjects/${subject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !subject.is_active }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSubjects(prev =>
          prev.map(s => (s.id === subject.id ? { ...s, is_active: !s.is_active } : s))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Quick 6-digit random numeric password / PIN generator (e.g. 950426)
  const generateRandomPassword = () => {
    if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      const pin = 100000 + (array[0] % 900000);
      return pin.toString();
    }
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error || "Failed to create user account.");
        return;
      }

      setActionSuccess(`User "${newUser.full_name}" (${newUser.username}) created successfully!`);
      setIsAddModalOpen(false);
      setNewUser({
        username: "",
        full_name: "",
        email: "",
        department: "",
        role: "Faculty",
        password: "",
      });
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message || "Failed to submit user creation request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPasswordValue }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error || "Failed to reset password.");
        return;
      }

      setActionSuccess(`Password for ${selectedUser.full_name} has been updated.`);
      setIsResetModalOpen(false);
      setResetPasswordValue("");
      setSelectedUser(null);
    } catch (err: any) {
      setFormError(err.message || "Failed to update password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (userToToggle: AppUser) => {
    if (userToToggle.is_builtin) return;
    try {
      const res = await fetch(`/api/users/${userToToggle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !userToToggle.is_active }),
      });

      if (res.ok) {
        setUsers(prev =>
          prev.map(u => (u.id === userToToggle.id ? { ...u, is_active: !u.is_active } : u))
        );
        setActionSuccess(
          `Account for ${userToToggle.full_name} is now ${!userToToggle.is_active ? "Active" : "Deactivated"}.`
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteUser = async (userToDelete: AppUser) => {
    if (userToDelete.is_builtin) return;
    if (!window.confirm(`Are you sure you want to permanently delete account "${userToDelete.full_name}" (${userToDelete.username})?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${userToDelete.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
        setActionSuccess(`User ${userToDelete.full_name} removed.`);
      } else {
        alert(data.error || "Failed to delete user.");
      }
    } catch (e) {
      console.error(e);
      alert("Error deleting user.");
    }
  };

  const filteredUsers = useMemo(() => {
    let list = [...users];
    const q = searchTerm.toLowerCase().trim();
    if (q) {
      list = list.filter(
        u =>
          u.full_name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.department && u.department.toLowerCase().includes(q))
      );
    }
    if (roleFilter !== "all") {
      list = list.filter(u => u.role === roleFilter);
    }
    return list;
  }, [users, searchTerm, roleFilter]);

  const summary = useMemo(() => {
    const total = users.length;
    const facultyCount = users.filter(u => u.role === "Faculty").length;
    const adminCount = users.filter(u => u.role === "Super Admin").length;
    const activeCount = users.filter(u => u.is_active).length;
    return { total, facultyCount, adminCount, activeCount };
  }, [users]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm font-semibold">Verifying permissions...</span>
        </div>
      </div>
    );
  }

  if (currentUser?.role !== "Super Admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 border border-rose-200 dark:border-rose-900/50 rounded-2xl p-6 text-center shadow-lg">
          <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Restricted Access</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-5">
            Faculty management is restricted to Super Administrators.
          </p>
          <button
            onClick={() => router.push("/")}
            className="w-full py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">

        {/* Success toast notification */}
        {actionSuccess && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 shadow-sm animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
              ✕
            </button>
          </div>
        )}

        {/* Migration Alert Banner if table not yet migrated */}
        {!tableReady && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs text-amber-800 dark:text-amber-300">
              <p className="font-bold text-sm">Supabase Database Setup Required</p>
              <p className="mt-1 text-amber-700 dark:text-amber-400 leading-relaxed">
                To save dynamic faculty accounts in Supabase, execute the file{" "}
                <code className="bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 rounded font-mono text-amber-900 dark:text-amber-200">
                  database/create_users_table.sql
                </code>{" "}
                in your Supabase SQL Editor. Built-in administrators remain fully active.
              </p>
            </div>
          </div>
        )}

        {/* Main Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 mb-6">
          <button
            type="button"
            onClick={() => setActiveMainTab("users")}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeMainTab === "users"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
          >
            <Users className="w-4 h-4" /> Faculty & Staff Accounts ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab("subjects")}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeMainTab === "subjects"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
          >
            <BookOpen className="w-4 h-4" /> Academic Subjects / Curriculum ({subjects.length})
          </button>
        </div>

        {/* TAB 1: FACULTY & STAFF ACCOUNTS */}
        {activeMainTab === "users" && (
          <>
            {/* Header */}
            <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
                    <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Faculty & Staff Directory
                  </h1>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 ml-11">
                  Create and manage teaching faculty accounts, credentials, and access roles.
                </p>
              </div>

              <div className="flex gap-2 ml-11 sm:ml-0">
                <button
                  onClick={fetchUsers}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                </button>
                <button
                  onClick={() => {
                    setFormError(null);
                    setNewUser({
                      username: "",
                      full_name: "",
                      email: "",
                      department: "",
                      role: "Faculty",
                      password: generateRandomPassword(),
                    });
                    setIsAddModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm shadow-indigo-200 dark:shadow-none"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add New Faculty
                </button>
              </div>
            </div>

            {/* Summary Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {[
                { label: "Total Staff Accounts", value: summary.total, icon: Users, bg: "bg-blue-50 dark:bg-blue-900/20", ring: "border-blue-100 dark:border-blue-900/40", iconColor: "text-blue-600 dark:text-blue-400" },
                { label: "Teaching Faculty", value: summary.facultyCount, icon: GraduationCap, bg: "bg-emerald-50 dark:bg-emerald-900/20", ring: "border-emerald-100 dark:border-emerald-900/40", iconColor: "text-emerald-600 dark:text-emerald-400" },
                { label: "Super Administrators", value: summary.adminCount, icon: Shield, bg: "bg-purple-50 dark:bg-purple-900/20", ring: "border-purple-100 dark:border-purple-900/40", iconColor: "text-purple-600 dark:text-purple-400" },
                { label: "Active Logins", value: summary.activeCount, icon: UserCheck, bg: "bg-teal-50 dark:bg-teal-900/20", ring: "border-teal-100 dark:border-teal-900/40", iconColor: "text-teal-600 dark:text-teal-400" },
              ].map(card => (
                <div key={card.label} className={`rounded-2xl bg-white dark:bg-gray-900 border ${card.ring} shadow-sm p-4 sm:p-5 flex items-center gap-3.5 transition-colors`}>
                  <div className={`p-2.5 sm:p-3 rounded-xl ${card.bg} shrink-0`}>
                    <card.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${card.iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 leading-tight">{card.label}</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mt-0.5">
                      {loading ? <span className="w-8 h-6 bg-gray-200 dark:bg-gray-700 animate-pulse rounded inline-block" /> : card.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, username, or department..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {["all", "Faculty", "Super Admin"].map(role => (
                  <button
                    key={role}
                    onClick={() => setRoleFilter(role)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold capitalize transition-all whitespace-nowrap ${roleFilter === role
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-gray-300"
                      }`}
                  >
                    {role === "all" ? "All Roles" : role}
                  </button>
                ))}
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-[700px] w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                      <th className="px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Staff Member
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Login ID
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Department
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Last Login
                      </th>
                      <th className="px-4 py-3 text-right text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {loading ? (
                      [...Array(4)].map((_, i) => (
                        <tr key={i}>
                          {[...Array(7)].map((_, j) => (
                            <td key={j} className="px-4 py-4">
                              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                          No staff accounts found.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map(userItem => {
                        const initials = userItem.full_name
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map(w => w[0])
                          .join("")
                          .toUpperCase();

                        return (
                          <tr key={userItem.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-sm">
                                  {initials}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate">
                                    {userItem.full_name}
                                  </p>
                                  {userItem.email && (
                                    <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate">
                                      {userItem.email}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3.5">
                              <span className="font-mono text-xs bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 px-2 py-0.5 rounded border border-gray-200 dark:border-slate-700">
                                {userItem.username}
                              </span>
                            </td>

                            <td className="px-4 py-3.5 text-xs text-gray-600 dark:text-gray-400">
                              {userItem.department || "General"}
                            </td>

                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${userItem.role === "Super Admin"
                                    ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                                    : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                                  }`}
                              >
                                <Shield className="w-2.5 h-2.5" /> {userItem.role}
                              </span>
                            </td>

                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${userItem.is_active
                                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                    : "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"
                                  }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${userItem.is_active ? "bg-emerald-500" : "bg-rose-500"}`} />
                                {userItem.is_active ? "Active" : "Disabled"}
                              </span>
                            </td>

                            <td className="px-4 py-3.5 text-xs text-gray-400 dark:text-slate-500">
                              {userItem.last_login ? new Date(userItem.last_login).toLocaleString() : "Never"}
                            </td>

                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {!userItem.is_builtin && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setSelectedUser(userItem);
                                        setResetPasswordValue(generateRandomPassword());
                                        setIsResetModalOpen(true);
                                      }}
                                      title="Reset Password"
                                      className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    >
                                      <KeyRound className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      onClick={() => handleToggleActive(userItem)}
                                      title={userItem.is_active ? "Deactivate Account" : "Activate Account"}
                                      className={`p-1.5 rounded-lg transition-colors ${userItem.is_active
                                          ? "text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                          : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                        }`}
                                    >
                                      <Power className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      onClick={() => handleDeleteUser(userItem)}
                                      title="Delete User"
                                      className="p-1.5 rounded-lg text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
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
          </>
        )}

        {/* TAB 2: ACADEMIC SUBJECTS & CURRICULUM */}
        {activeMainTab === "subjects" && (
          <div>
            {/* Header */}
            <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
                    <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Academic Subjects & Curriculum
                  </h1>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 ml-11">
                  Configure curriculum subjects per MBBS year. These dynamically populate during attendance session creation.
                </p>
              </div>

              <div className="flex gap-2 ml-11 sm:ml-0">
                <button
                  onClick={fetchSubjects}
                  disabled={subjectsLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${subjectsLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
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
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm shadow-indigo-200 dark:shadow-none"
                >
                  <Plus className="w-3.5 h-3.5" /> Add New Subject
                </button>
              </div>
            </div>

            {/* Quick Cohort Filter Pills */}
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
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
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {yearSubjects.length} Subject{yearSubjects.length !== 1 ? "s" : ""} registered
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSubjectError(null);
                          setNewSubject({ academic_year: yearName, name: "", code: "" });
                          setIsAddSubjectModalOpen(true);
                        }}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Subject to {yearName}
                      </button>
                    </div>

                    {yearSubjects.length === 0 ? (
                      <div className="py-8 text-center text-xs text-gray-400 dark:text-gray-500">
                        No subjects configured for {yearName}. Click "Add Subject" to configure curriculum.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {yearSubjects.map(sub => (
                          <div
                            key={sub.id}
                            className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                              sub.is_active
                                ? "bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/70"
                                : "bg-gray-100/50 dark:bg-gray-900/50 border-dashed border-gray-300 dark:border-gray-800 opacity-60"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {sub.code && (
                                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 shrink-0">
                                  {sub.code}
                                </span>
                              )}
                              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {sub.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleSubjectActive(sub)}
                                title={sub.is_active ? "Deactivate Subject" : "Activate Subject"}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  sub.is_active
                                    ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                    : "text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSubject(sub)}
                                title="Delete Subject"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal: Add New Faculty */}
            {isAddModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-gray-800 animate-fadeIn">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                        <UserPlus className="w-5 h-5" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Add New Faculty</h3>
                    </div>
                    <button
                      onClick={() => setIsAddModalOpen(false)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      ✕
                    </button>
                  </div>

                  {formError && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <form onSubmit={handleCreateUser} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Dr. Arindam Ghosh"
                        value={newUser.full_name}
                        onChange={e => setNewUser({ ...newUser, full_name: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Login ID / Username <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. arindam"
                          value={newUser.username}
                          onChange={e => setNewUser({ ...newUser, username: e.target.value.toLowerCase().trim() })}
                          className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Department
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Anatomy"
                          value={newUser.department}
                          onChange={e => setNewUser({ ...newUser, department: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Role & Permissions
                      </label>
                      <select
                        value={newUser.role}
                        onChange={e => setNewUser({ ...newUser, role: e.target.value as any })}
                        className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                      >
                        <option value="Faculty">Faculty (Can conduct attendance sessions)</option>
                        <option value="Super Admin">Super Admin (Full administrative access)</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                          Initial Password <span className="text-rose-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setNewUser({ ...newUser, password: generateRandomPassword() })}
                          className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" /> Auto-Generate
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={6}
                          value={newUser.password}
                          onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                          placeholder="e.g. 950426"
                          className="w-full pl-3 pr-10 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono tracking-wider focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">6-digit PIN password for the faculty member's login.</p>
                    </div>

                    <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddModalOpen(false)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50"
                      >
                        {isSubmitting ? "Creating..." : "Save Account"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Modal: Reset Password */}
            {isResetModalOpen && selectedUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-gray-800 animate-fadeIn">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                        <KeyRound className="w-5 h-5" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Reset Password</h3>
                    </div>
                    <button
                      onClick={() => setIsResetModalOpen(false)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      ✕
                    </button>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Setting new credentials for <strong className="text-gray-900 dark:text-white">{selectedUser.full_name}</strong> (<code>{selectedUser.username}</code>).
                  </p>

                  {formError && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <form onSubmit={handleResetPassword} className="space-y-3.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                          New Password
                        </label>
                        <button
                          type="button"
                          onClick={() => setResetPasswordValue(generateRandomPassword())}
                          className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" /> Auto-Generate
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        minLength={6}
                        value={resetPasswordValue}
                        onChange={e => setResetPasswordValue(e.target.value)}
                        placeholder="e.g. 950426"
                        className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono tracking-wider focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">Provide this new 6-digit PIN password to the faculty member.</p>
                    </div>

                    <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsResetModalOpen(false)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm disabled:opacity-50"
                      >
                        {isSubmitting ? "Updating..." : "Update Password"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Modal: Add New Subject */}
            {isAddSubjectModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-gray-800 animate-fadeIn">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Add Curriculum Subject</h3>
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
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50"
                      >
                        {isSubjectSubmitting ? "Saving..." : "Save Subject"}
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
