"use client";
import Link from "next/link";
import { useState } from "react";
import {
  HiCheck,
  HiCheckCircle,
  HiCloud,
  HiExclamationCircle,
  HiEye,
  HiNoSymbol,
  HiPencil,
  HiPhoto,
  HiShieldCheck,
  HiTrash,
} from "react-icons/hi2";
import {
  adminDeleteUser,
  impersonateUser,
  toggleGlobalAdmin,
} from "@/app/actions/admins";
import { banUser, unbanUser } from "@/app/actions/users";
import EditUserModal from "@/components/admin/EditUserModal";
import { AdminSearch, AdminToolbar } from "@/components/ui/AdminPageLayout";
import ConfirmModal from "@/components/ui/ConfirmModal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import UserAvatar from "@/components/ui/UserAvatar";
import { formatBytes } from "@/lib/format";

interface User {
  id: string;
  name: string;
  email: string;
  handle?: string | null;
  slackId: string | null;
  avatarS3Key: string | null;
  isGlobalAdmin: boolean;
  isBanned: boolean;
  bannedAt: Date | null;
  bannedById: string | null;
  banReason: string | null;
  verificationStatus: string | null;
  createdAt: Date;
  bio?: string | null;
  preferredName?: string | null;
  socialLinks?: Record<string, string> | null;
  storageLimit: number;
}
interface UserWithStats {
  user: User;
  photoCount: number;
  storageUsed: number;
  bannedByName?: string;
}
interface UsersClientProps {
  usersWithStats: UserWithStats[];
  totalUsers: number;
  adminCount: number;
  verifiedCount: number;
  bannedCount: number;
}
export default function UsersClient({
  usersWithStats: initialUsers,
  totalUsers,
  adminCount,
  verifiedCount,
  bannedCount,
}: UsersClientProps) {
  const [users, setUsers] = useState(initialUsers);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "admin" | "verified" | "banned"
  >("all");
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [unbanModalOpen, setUnbanModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [adminToggleModalOpen, setAdminToggleModalOpen] = useState(false);
  const [impersonateModalOpen, setImpersonateModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDeleteContent, setBanDeleteContent] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const filteredUsers = users.filter(({ user }) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.slackId?.toLowerCase().includes(query);
    let matchesStatus = true;
    if (statusFilter === "admin") matchesStatus = user.isGlobalAdmin;
    if (statusFilter === "verified")
      matchesStatus = user.verificationStatus === "verified";
    if (statusFilter === "banned") matchesStatus = user.isBanned;
    return matchesSearch && matchesStatus;
  });
  const visibleUsers = filteredUsers.slice(0, visibleCount);
  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => prev + 20);
      setIsLoadingMore(false);
    }, 500);
  };
  const handleBanClick = (userWithStats: UserWithStats) => {
    setSelectedUser(userWithStats);
    setBanReason("");
    setBanDeleteContent(true);
    setBanModalOpen(true);
  };
  const handleUnbanClick = (userWithStats: UserWithStats) => {
    setSelectedUser(userWithStats);
    setUnbanModalOpen(true);
  };
  const handleEditClick = (userWithStats: UserWithStats) => {
    setSelectedUser(userWithStats);
    setEditModalOpen(true);
  };
  const handleDeleteClick = (userWithStats: UserWithStats) => {
    setSelectedUser(userWithStats);
    setDeleteModalOpen(true);
  };
  const handleAdminToggleClick = (userWithStats: UserWithStats) => {
    setSelectedUser(userWithStats);
    setAdminToggleModalOpen(true);
  };
  const handleImpersonateClick = (userWithStats: UserWithStats) => {
    setSelectedUser(userWithStats);
    setImpersonateModalOpen(true);
  };
  const handleImpersonate = async () => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      const result = await impersonateUser(selectedUser.user.id);
      if (!result.success) throw new Error(result.error);
      window.location.href = "/";
    } catch (error) {
      console.error("Error impersonating user:", error);
      alert("Failed to impersonate user");
      setProcessing(false);
    }
  };
  const handleAdminToggle = async () => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      const result = await toggleGlobalAdmin(selectedUser.user.id);
      if (result.success) {
        setUsers(
          users.map((u) =>
            u.user.id === selectedUser.user.id
              ? {
                  ...u,
                  user: {
                    ...u.user,
                    isGlobalAdmin: result.isGlobalAdmin ?? false,
                  },
                }
              : u,
          ),
        );
        setAdminToggleModalOpen(false);
        setSelectedUser(null);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Error toggling admin status:", error);
      alert("Failed to update admin status");
    } finally {
      setProcessing(false);
    }
  };
  const handleBan = async () => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      const result = await banUser(
        selectedUser.user.id,
        banReason,
        banDeleteContent,
      );
      if (!result.success) throw new Error(result.error);
      setUsers(
        users.map((u) =>
          u.user.id === selectedUser.user.id
            ? {
                ...u,
                user: {
                  ...u.user,
                  isBanned: true,
                  bannedAt: new Date(),
                  banReason,
                },
                photoCount: banDeleteContent ? 0 : u.photoCount,
                storageUsed: banDeleteContent ? 0 : u.storageUsed,
              }
            : u,
        ),
      );
      setBanModalOpen(false);
      setSelectedUser(null);
      setBanReason("");
    } catch (error) {
      console.error("Error banning user:", error);
      alert("Failed to ban user");
    } finally {
      setProcessing(false);
    }
  };
  const handleDelete = async () => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      const result = await adminDeleteUser(selectedUser.user.id);
      if (!result.success) throw new Error(result.error);
      setUsers(users.filter((u) => u.user.id !== selectedUser.user.id));
      setDeleteModalOpen(false);
      setSelectedUser(null);
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user");
    } finally {
      setProcessing(false);
    }
  };
  const handleUnban = async () => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      const result = await unbanUser(selectedUser.user.id);
      if (!result.success) throw new Error(result.error);
      setUsers(
        users.map((u) =>
          u.user.id === selectedUser.user.id
            ? {
                ...u,
                user: {
                  ...u.user,
                  isBanned: false,
                  bannedAt: null,
                  bannedById: null,
                  banReason: null,
                },
              }
            : u,
        ),
      );
      setUnbanModalOpen(false);
      setSelectedUser(null);
    } catch (error) {
      console.error("Error unbanning user:", error);
      alert("Failed to unban user");
    } finally {
      setProcessing(false);
    }
  };
  return (
    <>
      <AdminToolbar>
        <AdminSearch
          placeholder="Search users by name, email, or Slack ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-4 py-2 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === "all"
                ? "bg-zinc-800 border-zinc-700 text-white"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            All Users ({totalUsers})
          </button>
          <button
            onClick={() => setStatusFilter("admin")}
            className={`px-4 py-2 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === "admin"
                ? "bg-red-900/20 border-red-900/50 text-red-400"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            Admins ({adminCount})
          </button>
          <button
            onClick={() => setStatusFilter("verified")}
            className={`px-4 py-2 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === "verified"
                ? "bg-green-900/20 border-green-900/50 text-green-400"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            Verified ({verifiedCount})
          </button>
          <button
            onClick={() => setStatusFilter("banned")}
            className={`px-4 py-2 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === "banned"
                ? "bg-orange-900/20 border-orange-900/50 text-orange-400"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            Banned ({bannedCount})
          </button>
        </div>
      </AdminToolbar>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Showing{" "}
          <span className="text-white font-medium">{visibleUsers.length}</span>{" "}
          of{" "}
          <span className="text-white font-medium">{filteredUsers.length}</span>{" "}
          results
        </p>
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Photos</TableHead>
              <TableHead>Storage</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleUsers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-zinc-400"
                >
                  {searchQuery
                    ? "No users found matching your search"
                    : "No users found"}
                </TableCell>
              </TableRow>
            ) : (
              visibleUsers.map(
                ({ user, photoCount, storageUsed, bannedByName }) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Link
                        href={`/users/${user.handle || user.id}`}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                      >
                        <UserAvatar
                          user={user}
                          size="sm"
                          className={
                            user.isBanned ? "!bg-zinc-700 !bg-none" : ""
                          }
                          avatarVersion={user.avatarS3Key ? 1 : 0}
                        />
                        <div className="min-w-0 max-w-[120px]">
                          <div
                            className={`font-medium truncate text-sm ${user.isBanned ? "text-zinc-500" : "text-white"}`}
                          >
                            {user.name}
                          </div>
                          {user.slackId && (
                            <div className="text-[10px] text-zinc-500 truncate">
                              {user.slackId}
                            </div>
                          )}
                        </div>
                      </Link>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-zinc-300">
                        <span className="truncate max-w-[150px]">
                          {user.email}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.isBanned ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-orange-500/30 bg-orange-500/5 text-orange-400 rounded text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
                            <HiNoSymbol className="w-3 h-3" />
                            Banned
                          </span>
                        ) : (
                          <>
                            {user.isGlobalAdmin && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-red-600/30 bg-red-600/5 text-red-400 rounded text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
                                <HiShieldCheck className="w-3 h-3" />
                                Admin
                              </span>
                            )}

                            {user.verificationStatus === "verified" ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-green-500/30 bg-green-500/5 text-green-400 rounded text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
                                <HiCheckCircle className="w-3 h-3" />
                                Verified
                              </span>
                            ) : user.verificationStatus ===
                              "needs_submission" ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-yellow-500/30 bg-yellow-500/5 text-yellow-400 rounded text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
                                <HiExclamationCircle className="w-3 h-3" />
                                Pending
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>
                      {user.isBanned && user.banReason && (
                        <div
                          className="mt-1 text-xs text-zinc-500 line-clamp-1"
                          title={user.banReason}
                        >
                          Reason: {user.banReason}
                        </div>
                      )}
                      {user.isBanned && bannedByName && (
                        <div className="mt-1 text-xs text-zinc-500">
                          By: {bannedByName}
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-zinc-300">
                        <HiPhoto className="w-4 h-4 text-zinc-500" />
                        <span>{photoCount}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-sm text-zinc-300">
                          <HiCloud className="w-4 h-4 text-zinc-500" />
                          <span>{formatBytes(storageUsed)}</span>
                        </div>
                        <div className="w-full max-w-[80px] h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              storageUsed / user.storageLimit > 0.9
                                ? "bg-red-500"
                                : storageUsed / user.storageLimit > 0.7
                                  ? "bg-yellow-500"
                                  : "bg-blue-500"
                            }`}
                            style={{
                              width: `${Math.min((storageUsed / user.storageLimit) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                        <span className="whitespace-nowrap">
                          {new Date(user.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                            },
                          )}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleImpersonateClick({
                              user,
                              photoCount,
                              storageUsed,
                              bannedByName,
                            })
                          }
                          className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                          title="Impersonate User"
                        >
                          <HiEye className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleEditClick({
                              user,
                              photoCount,
                              storageUsed,
                              bannedByName,
                            })
                          }
                          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                          title="Edit User"
                        >
                          <HiPencil className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleAdminToggleClick({
                              user,
                              photoCount,
                              storageUsed,
                              bannedByName,
                            })
                          }
                          className={`p-1.5 rounded-lg transition-colors ${
                            user.isGlobalAdmin
                              ? "text-red-400 hover:text-red-300 hover:bg-red-700/10"
                              : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                          }`}
                          title={
                            user.isGlobalAdmin ? "Remove Admin" : "Make Admin"
                          }
                        >
                          <HiShieldCheck className="w-4 h-4" />
                        </button>

                        {user.isBanned ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleUnbanClick({
                                user,
                                photoCount,
                                storageUsed,
                                bannedByName,
                              })
                            }
                            className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                            title="Unban User"
                          >
                            <HiCheck className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleBanClick({
                                user,
                                photoCount,
                                storageUsed,
                                bannedByName,
                              })
                            }
                            disabled={user.isGlobalAdmin}
                            className="p-1.5 text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              user.isGlobalAdmin
                                ? "Cannot ban admin users"
                                : "Ban User"
                            }
                          >
                            <HiNoSymbol className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteClick({
                              user,
                              photoCount,
                              storageUsed,
                              bannedByName,
                            })
                          }
                          disabled={user.isGlobalAdmin}
                          className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-700/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            user.isGlobalAdmin
                              ? "Cannot delete admin users"
                              : "Delete User"
                          }
                        >
                          <HiTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ),
              )
            )}
          </TableBody>
        </Table>
        {visibleUsers.length < filteredUsers.length && (
          <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-center">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoadingMore ? (
                <>
                  <LoadingSpinner size="sm" />
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </button>
          </div>
        )}
      </TableContainer>

      <ConfirmModal
        isOpen={banModalOpen}
        onClose={() => !processing && setBanModalOpen(false)}
        onConfirm={handleBan}
        title="Ban User"
        message={
          <div className="space-y-4">
            <p className="text-zinc-300">
              Are you sure you want to ban{" "}
              <strong className="text-white">{selectedUser?.user.name}</strong>?
            </p>

            <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-800">
              <label
                htmlFor="banDeleteContent"
                className="text-sm text-zinc-300 cursor-pointer select-none flex-1"
              >
                <span className="block font-medium text-white mb-0.5">
                  Delete all content
                </span>
                Permanently remove all photos and videos uploaded by this user.
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={banDeleteContent}
                onClick={() => setBanDeleteContent(!banDeleteContent)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${banDeleteContent ? "bg-red-600" : "bg-zinc-700"}`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${banDeleteContent ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>

            <div>
              <label
                htmlFor="banReason"
                className="block text-sm font-medium text-zinc-300 mb-2"
              >
                Reason for ban (optional)
              </label>
              <textarea
                id="banReason"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Enter reason for banning this user..."
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-600/50 resize-none"
                rows={3}
                disabled={processing}
              />
            </div>
          </div>
        }
        confirmText={processing ? "Banning..." : "Ban User"}
        confirmButtonClass="bg-orange-500 hover:bg-orange-600"
        disabled={processing}
      />

      <ConfirmModal
        isOpen={unbanModalOpen}
        onClose={() => !processing && setUnbanModalOpen(false)}
        onConfirm={handleUnban}
        title="Unban User"
        message={
          <div className="space-y-4">
            <p className="text-zinc-300">
              Are you sure you want to unban{" "}
              <strong className="text-white">{selectedUser?.user.name}</strong>?
            </p>
            <p className="text-sm text-zinc-400">
              They will be able to sign in and use the platform again.
            </p>
          </div>
        }
        confirmText={processing ? "Unbanning..." : "Unban User"}
        confirmButtonClass="bg-green-500 hover:bg-green-600"
        disabled={processing}
      />

      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => !processing && setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete User"
        message={
          <div className="space-y-4">
            <p className="text-zinc-300">
              Are you sure you want to delete{" "}
              <strong className="text-white">{selectedUser?.user.name}</strong>?
            </p>
            <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4">
              <p className="text-sm text-red-200">
                <strong>Warning:</strong> This action is irreversible. All data
                associated with this user, including photos, events, and series,
                will be permanently deleted.
              </p>
            </div>
          </div>
        }
        confirmText={processing ? "Deleting..." : "Delete User"}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        disabled={processing}
      />

      <ConfirmModal
        isOpen={impersonateModalOpen}
        onClose={() => !processing && setImpersonateModalOpen(false)}
        onConfirm={handleImpersonate}
        title="Impersonate User"
        message={
          <div className="space-y-4">
            <p className="text-zinc-300">
              Are you sure you want to impersonate{" "}
              <strong className="text-white">{selectedUser?.user.name}</strong>?
            </p>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <p className="text-sm text-blue-200">
                <strong>Note:</strong> You will be logged in as this user. To
                return to your admin account, you will need to log out and log
                back in.
              </p>
            </div>
          </div>
        }
        confirmText={processing ? "Switching..." : "Impersonate"}
        confirmButtonClass="bg-blue-600 hover:bg-blue-700"
        disabled={processing}
      />

      <ConfirmModal
        isOpen={adminToggleModalOpen}
        onClose={() => !processing && setAdminToggleModalOpen(false)}
        onConfirm={handleAdminToggle}
        title={
          selectedUser?.user.isGlobalAdmin
            ? "Remove Admin Access"
            : "Grant Admin Access"
        }
        message={
          <div className="space-y-4">
            <p className="text-zinc-300">
              Are you sure you want to{" "}
              {selectedUser?.user.isGlobalAdmin
                ? "remove admin access from"
                : "grant admin access to"}{" "}
              <strong className="text-white">{selectedUser?.user.name}</strong>?
            </p>
            {!selectedUser?.user.isGlobalAdmin && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                <p className="text-sm text-yellow-200">
                  <strong>Warning:</strong> Global admins have full access to
                  manage users, content, and system settings.
                </p>
              </div>
            )}
          </div>
        }
        confirmText={
          processing
            ? "Updating..."
            : selectedUser?.user.isGlobalAdmin
              ? "Remove Admin"
              : "Make Admin"
        }
        confirmButtonClass={
          selectedUser?.user.isGlobalAdmin
            ? "bg-red-600 hover:bg-red-700"
            : "bg-blue-600 hover:bg-blue-700"
        }
        disabled={processing}
      />

      {editModalOpen && selectedUser && (
        <EditUserModal
          user={selectedUser.user}
          onClose={() => setEditModalOpen(false)}
          onSave={(updatedUser) => {
            setUsers(
              users.map((u) =>
                u.user.id === updatedUser.id
                  ? {
                      ...u,
                      user: {
                        ...u.user,
                        ...updatedUser,
                      },
                    }
                  : u,
              ),
            );
          }}
        />
      )}
    </>
  );
}
