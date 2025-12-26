"use client";
import { format } from "date-fns";
import { useState } from "react";
import {
  HiCheckCircle,
  HiCloudArrowUp,
  HiCommandLine,
  HiTrash,
  HiXCircle,
} from "react-icons/hi2";
import { revokeApiKeyAdmin } from "@/app/actions/admin-api-keys";
import { AdminSearch, AdminToolbar } from "@/components/ui/AdminPageLayout";
import ConfirmModal from "@/components/ui/ConfirmModal";
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

interface ApiKey {
  id: string;
  key: string;
  name: string | null;
  note: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  canUpload: boolean;
  isRevoked: boolean;
  rateLimitRequestCount: number | null;
  user: {
    id: string;
    name: string;
    email: string;
    avatarS3Key: string | null;
    handle: string | null;
  };
}
export default function ApiKeyList({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [search, setSearch] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const filteredKeys = keys.filter((key) => {
    const term = search.toLowerCase();
    return (
      (key.name?.toLowerCase() || "").includes(term) ||
      (key.note?.toLowerCase() || "").includes(term) ||
      key.key.toLowerCase().includes(term) ||
      key.user.name.toLowerCase().includes(term) ||
      key.user.email.toLowerCase().includes(term) ||
      key.id.toLowerCase().includes(term)
    );
  });
  const handleRevoke = async () => {
    if (!revokingId) return;
    setIsRevoking(true);
    try {
      const result = await revokeApiKeyAdmin(revokingId);
      if (result.success) {
        setKeys(
          keys.map((k) =>
            k.id === revokingId ? { ...k, isRevoked: true } : k,
          ),
        );
        setRevokingId(null);
      } else {
        alert("Failed to revoke API key");
      }
    } catch (error) {
      console.error("Error revoking key:", error);
      alert("An error occurred");
    } finally {
      setIsRevoking(false);
    }
  };
  return (
    <div className="space-y-6">
      <AdminToolbar>
        <AdminSearch
          placeholder="Search keys by name, key, user, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </AdminToolbar>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Showing{" "}
          <span className="text-white font-medium">{filteredKeys.length}</span>{" "}
          of <span className="text-white font-medium">{keys.length}</span>{" "}
          results
        </p>
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key Details</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="relative">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredKeys.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-12 text-zinc-500"
                >
                  No API keys found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              filteredKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-zinc-800 rounded-lg border border-zinc-700">
                        <HiCommandLine className="h-5 w-5 text-zinc-400" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-white">
                          {key.name || "Unnamed Key"}
                        </div>
                        <div className="text-xs text-zinc-500 font-mono break-all">
                          {key.key}
                        </div>
                        {key.note && (
                          <div className="text-xs text-zinc-400 mt-1 italic">
                            {key.note}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <UserAvatar user={key.user} size="sm" />
                      <div className="ml-3">
                        <div className="text-sm font-medium text-zinc-200">
                          {key.user.name}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {key.user.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {key.canUpload ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 w-fit">
                          <HiCloudArrowUp className="mr-1 h-3 w-3" />
                          Upload
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 w-fit">
                          Read Only
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-zinc-300">
                      {key.lastUsedAt ? (
                        <span>
                          {format(
                            new Date(key.lastUsedAt),
                            "MMM d, yyyy HH:mm",
                          )}
                        </span>
                      ) : (
                        <span className="text-zinc-500">Never used</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      Created {format(new Date(key.createdAt), "MMM d, yyyy")}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1 font-mono">
                      {key.rateLimitRequestCount || 0} reqs / hr
                    </div>
                  </TableCell>
                  <TableCell>
                    {key.isRevoked ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/20 text-red-400 border border-red-900/50">
                        <HiXCircle className="mr-1 h-3 w-3" />
                        Revoked
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/20 text-green-400 border border-green-900/50">
                        <HiCheckCircle className="mr-1 h-3 w-3" />
                        Active
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {!key.isRevoked && (
                      <button
                        onClick={() => setRevokingId(key.id)}
                        className="text-red-400 hover:text-red-300 transition-colors p-2 hover:bg-red-900/20 rounded-lg"
                        title="Revoke Key"
                      >
                        <HiTrash className="h-5 w-5" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <ConfirmModal
        isOpen={!!revokingId}
        onClose={() => setRevokingId(null)}
        onConfirm={handleRevoke}
        title="Revoke API Key"
        message="Are you sure you want to revoke this API key? This action cannot be undone and any applications using this key will stop working immediately."
        confirmText="Revoke Key"
        danger={true}
        disabled={isRevoking}
      />
    </div>
  );
}
