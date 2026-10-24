"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Users, UserPlus, Shield, KeyRound, Search, RefreshCw, CheckCircle2,
  XCircle, Trash2, Power, AlertTriangle, Eye, EyeOff,
  Sparkles, Lock, Building2, UserX, Loader2, Pencil
} from "lucide-react";
import { useAuth } from "@/lib/auth";

interface AppUser {
  id: string;
  username: string;
  full_name: string;
  email?: string;
  role: "Super Admin" | "Admin" | "Faculty";
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
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

  // Edit User Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<AppUser | null>(null);
  const [editFormData, setEditFormData] = useState({
    full_name: "",
    username: "",
    email: "",
    department: "",
    role: "Faculty" as "Super Admin" | "Admin" | "Faculty",
  });
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete User Modal states
  const [userToDeleteState, setUserToDeleteState] = useState<AppUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Form states
  const [newUser, setNewUser] = useState({
    username: "",
    full_name: "",
    email: "",
    department: "",
    role: "Faculty" as "Super Admin" | "Admin" | "Faculty",
    password: "",
  });
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Role Gate: Super Admin & Admin allowed
  useEffect(() => {
    if (!isAuthLoading && currentUser && currentUser.role !== "Super Admin" && currentUser.role !== "Admin") {
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

  useEffect(() => {
    if (currentUser?.role === "Super Admin" || currentUser?.role === "Admin") {
      fetchUsers();
    }
  }, [currentUser]);

  const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  };

  const handleOpenAddModal = () => {
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
  };

  const handleOpenEditModal = (userItem: AppUser) => {
    setUserToEdit(userItem);
    setEditFormData({
      full_name: userItem.full_name || "",
      username: userItem.username || "",
      email: userItem.email || "",
      department: userItem.department || "",
      role: userItem.role,
    });
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToEdit) return;
    setEditError(null);
    setIsEditSubmitting(true);
    try {
      const res = await fetch(`/api/users/${userToEdit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFormData),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setEditError(data.error || "Failed to update user.");
        return;
      }
      setActionSuccess(`Staff account for "${editFormData.full_name}" updated successfully.`);
      setIsEditModalOpen(false);
      setUserToEdit(null);
      fetchUsers();
    } catch (err: any) {
      setEditError(err.message || "Failed to update user.");
    } finally {
      setIsEditSubmitting(false);
    }
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
      setIsAddModalOpen(false);
      setActionSuccess(`Account for ${newUser.full_name} (@${newUser.username}) created successfully.`);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message || "Network error while creating account.");
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
        body: JSON.stringify({ action: "reset_password", password: resetPasswordValue }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error || "Failed to update password.");
        return;
      }
      setIsResetModalOpen(false);
      setActionSuccess(`Password for @${selectedUser.username} updated successfully.`);
    } catch (err: any) {
      setFormError(err.message || "Network error while updating password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (userItem: AppUser) => {
    try {
      const res = await fetch(`/api/users/${userItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_active", is_active: !userItem.is_active }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchUsers();
        setActionSuccess(`User @${userItem.username} ${!userItem.is_active ? "activated" : "deactivated"}.`);
      } else {
        setFormError(data.error || "Failed to toggle user status.");
      }
    } catch (err: any) {
      setFormError("Network error.");
    }
  };

  const handleDeleteUser = (userItem: AppUser) => {
    setUserToDeleteState(userItem);
  };

  const confirmDeleteUser = async () => {
    if (!userToDeleteState) return;
    setIsDeletingUser(true);
    try {
      const res = await fetch(`/api/users/${userToDeleteState.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error || "Failed to delete user account.");
        return;
      }
      setActionSuccess(`User account @${userToDeleteState.username} deleted permanently.`);
      setUserToDeleteState(null);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message || "Network error deleting user.");
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (currentUser?.role === "Admin" && u.role !== "Faculty") {
        return false;
      }
      const matchSearch =
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (u.department && u.department.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? u.is_active : !u.is_active);
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter, currentUser]);

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 p-4 sm:p-6 lg:p-8 transition-colors">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400">
                <Users className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2.5">
                {currentUser?.role === "Admin" ? "Faculty Directory" : "Faculty & Staff Directory"}
                {currentUser?.role === "Admin" && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Admin Scope
                  </span>
                )}
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 ml-11">
              {currentUser?.role === "Admin"
                ? "Create and manage teaching faculty accounts, credentials, and access."
                : "Create and manage teaching faculty, administrator accounts, credentials, and access roles."}
            </p>
          </div>

          <div className="flex items-center gap-2.5 ml-11 sm:ml-0">
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm shadow-indigo-200 dark:shadow-none"
            >
              <UserPlus className="w-4 h-4" /> Add Staff Member
            </button>
          </div>
        </div>

        {/* Alerts */}
        {actionSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-800">✕</button>
          </div>
        )}

        {formError && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
            <button onClick={() => setFormError(null)} className="text-rose-600 hover:text-rose-800">✕</button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, username, email, department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs sm:text-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>

          <div className="flex gap-2 shrink-0">
            {currentUser?.role === "Super Admin" && (
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              >
                <option value="all">All Roles</option>
                <option value="Super Admin">Super Admin</option>
                <option value="Admin">Admin</option>
                <option value="Faculty">Faculty</option>
              </select>
            )}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* User Accounts Table */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50/75 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 text-gray-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-5 py-3.5">User</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                      Loading staff accounts...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                      No staff accounts found matching your query.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = currentUser?.username === u.username;
                    return (
                      <tr key={u.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400 text-xs shrink-0">
                              {u.full_name?.charAt(0)?.toUpperCase() || u.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-white truncate">
                                {u.full_name}
                              </p>
                              <p className="text-[11px] text-gray-400 font-mono">@{u.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              u.role === "Super Admin"
                                ? "bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                                : u.role === "Admin"
                                ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                                : "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                          {u.department || "—"}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                              u.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-emerald-500" : "bg-gray-300"}`} />
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditModal(u)}
                              title="Edit User"
                              className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedUser(u);
                                setResetPasswordValue(generateRandomPassword());
                                setIsResetModalOpen(true);
                              }}
                              title="Reset Password"
                              className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                            {!isSelf && !u.is_builtin && (
                              <>
                                <button
                                  onClick={() => handleToggleActive(u)}
                                  title={u.is_active ? "Deactivate" : "Activate"}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    u.is_active
                                      ? "text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                      : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                  }`}
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u)}
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

        {/* Modal: Add User */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-gray-800 animate-fadeIn">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Create Staff Account</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Register new teaching faculty or admin</p>
                  </div>
                </div>
                <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
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
                    placeholder="e.g. Dr. Rajesh Kumar"
                    value={newUser.full_name}
                    onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Username <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. rajeshk"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toLowerCase().trim() })}
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
                      onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="staff@college.edu"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Role & Permissions
                  </label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  >
                    <option value="Faculty">Faculty (Lectures & Attendance Only)</option>
                    {currentUser?.role === "Super Admin" && (
                      <>
                        <option value="Admin">Admin (Curriculum & Faculty Management)</option>
                        <option value="Super Admin">Super Admin (Full Root System Access)</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Initial Password <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setNewUser({ ...newUser, password: generateRandomPassword() })}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Auto-generate
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-400 focus:outline-none pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
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
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating...
                      </>
                    ) : (
                      "Create Account"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit User */}
        {isEditModalOpen && userToEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-gray-800 animate-fadeIn">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Edit Staff Account</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Update account profile and permissions</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setUserToEdit(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {editError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{editError}</span>
                </div>
              )}

              <form onSubmit={handleSaveEditUser} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.full_name}
                    onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      disabled={userToEdit.is_builtin}
                      value={editFormData.username}
                      onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value.toLowerCase().trim() })}
                      className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-400 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={editFormData.department}
                      onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                </div>

                {currentUser?.role === "Super Admin" && !userToEdit.is_builtin && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Role
                    </label>
                    <select
                      value={editFormData.role}
                      onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                    >
                      <option value="Faculty">Faculty</option>
                      <option value="Admin">Admin</option>
                      <option value="Super Admin">Super Admin</option>
                    </select>
                  </div>
                )}

                <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setUserToEdit(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isEditSubmitting}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isEditSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
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
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Reset Password</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Update password for @{selectedUser.username}</p>
                  </div>
                </div>
                <button onClick={() => setIsResetModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      New Password <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setResetPasswordValue(generateRandomPassword())}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Auto-generate
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={resetPasswordValue}
                    onChange={(e) => setResetPasswordValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
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
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating...
                      </>
                    ) : (
                      "Update Password"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Delete User Confirmation */}
        {userToDeleteState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-gray-800 text-center animate-scaleIn">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 flex items-center justify-center text-rose-600 dark:text-rose-400 mx-auto mb-4 shadow-sm">
                <UserX className="w-7 h-7" />
              </div>

              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1.5">
                Delete Staff Account?
              </h3>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4">
                Are you sure you want to permanently delete this user account?
              </p>

              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 text-left mb-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {userToDeleteState.full_name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                    @{userToDeleteState.username}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
                  {userToDeleteState.role}
                </span>
              </div>

              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 text-left flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setUserToDeleteState(null);
                    setFormError(null);
                  }}
                  disabled={isDeletingUser}
                  className="w-1/2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteUser}
                  disabled={isDeletingUser}
                  className="w-1/2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeletingUser ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Delete User</span>
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
