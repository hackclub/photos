"use client";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  HiClipboard,
  HiClipboardDocumentCheck,
  HiCodeBracket,
  HiKey,
  HiPlus,
  HiTrash,
} from "react-icons/hi2";
import { createApiKey, revokeApiKey } from "@/app/actions/api-keys";
import ApiPlayground from "@/components/developer/ApiPlayground";
import { AdminToolbar } from "@/components/ui/AdminPageLayout";
import ConfirmModal from "@/components/ui/ConfirmModal";
import FormInput from "@/components/ui/FormInput";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

interface ApiKey {
  id: string;
  name: string | null;
  note: string | null;
  canUpload: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}
export default function DeveloperDashboard({
  initialKeys,
}: {
  initialKeys: ApiKey[];
}) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyNote, setNewKeyNote] = useState("");
  const [canUpload, setCanUpload] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [showUploadWarningModal, setShowUploadWarningModal] = useState(false);
  const router = useRouter();
  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    if (canUpload) {
      setShowUploadWarningModal(true);
      return;
    }
    await submitCreateKey();
  };
  const submitCreateKey = async () => {
    setIsLoading(true);
    const result = await createApiKey(newKeyName, canUpload, newKeyNote);
    setIsLoading(false);
    setShowUploadWarningModal(false);
    if (result.success && result.key) {
      setCreatedKey(result.key);
      setNewKeyName("");
      setNewKeyNote("");
      setCanUpload(false);
      router.refresh();
    } else {
      alert("Failed to create API key");
    }
  };
  const handleRevokeKey = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to revoke this API key? This action cannot be undone.",
      )
    ) {
      return;
    }
    const result = await revokeApiKey(id);
    if (result.success) {
      setKeys(keys.filter((k) => k.id !== id));
      router.refresh();
    } else {
      alert("Failed to revoke API key");
    }
  };
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <section className="space-y-6">
            <AdminToolbar>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <HiKey className="w-5 h-5" />
                Your API Keys
              </h2>
            </AdminToolbar>

            <div>
              {createdKey && (
                <div className="mb-8 p-4 bg-green-500/10 border border-green-500/20 rounded-xl animate-in fade-in slide-in-from-top-2">
                  <p className="text-green-400 font-medium mb-2 flex items-center gap-2">
                    <HiClipboardDocumentCheck className="w-5 h-5" />
                    API Key Created Successfully!
                  </p>
                  <p className="text-sm text-zinc-400 mb-3">
                    Please copy this key now. You won't be able to see it again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-black p-3 rounded-lg border border-green-500/20 font-mono text-sm text-green-300 break-all">
                      {createdKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(createdKey)}
                      className="p-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                      title="Copy to clipboard"
                    >
                      {copiedKey ? (
                        <HiClipboardDocumentCheck className="w-5 h-5" />
                      ) : (
                        <HiClipboard className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {keys.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl">
                    <HiKey className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                    <p className="text-zinc-500">
                      You haven't created any API keys yet.
                    </p>
                  </div>
                ) : (
                  <TableContainer>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Permissions</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Last Used</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {keys.map((key) => (
                          <TableRow key={key.id} className="group">
                            <TableCell className="font-medium text-white">
                              <div>{key.name || "Untitled Key"}</div>
                              {key.note && (
                                <div className="text-xs text-zinc-500 mt-1">
                                  {key.note}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-zinc-500">
                              <div className="flex gap-2">
                                <span className="px-2 py-1 rounded-full bg-zinc-500/10 border border-zinc-500/20 text-xs text-zinc-400">
                                  Read
                                </span>
                                {key.canUpload && (
                                  <span className="px-2 py-1 rounded-full bg-red-600/10 text-xs text-red-400 border border-red-600/20">
                                    Upload
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-zinc-500">
                              {format(new Date(key.createdAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell className="text-zinc-500">
                              {key.lastUsedAt
                                ? format(
                                    new Date(key.lastUsedAt),
                                    "MMM d, yyyy",
                                  )
                                : "Never"}
                            </TableCell>
                            <TableCell className="text-right">
                              <button
                                onClick={() => handleRevokeKey(key.id)}
                                className="text-zinc-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-700/10 transition-all"
                                title="Revoke Key"
                              >
                                <HiTrash className="w-4 h-4" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-zinc-800">
                <h3 className="text-sm font-medium text-white mb-4">
                  Create New Key
                </h3>
                <form onSubmit={handleCreateKey} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput
                      label="Key Name"
                      placeholder="e.g. My Portfolio Site"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      required
                    />
                    <FormInput
                      label="Note (Optional)"
                      placeholder="What is this key used for?"
                      value={newKeyNote}
                      onChange={(e) => setNewKeyNote(e.target.value)}
                    />
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="canUpload"
                        checked={canUpload}
                        onChange={(e) => setCanUpload(e.target.checked)}
                        className="mt-1 w-4 h-4 rounded-md border-zinc-700 bg-zinc-800 text-red-600 focus:ring-red-600 focus:ring-offset-zinc-900"
                      />
                      <div>
                        <label
                          htmlFor="canUpload"
                          className="text-sm font-medium text-white block mb-1"
                        >
                          Allow Uploads
                        </label>
                        <p className="text-xs text-zinc-400">
                          This key will be able to upload media to events you
                          have joined.
                          <br />
                          <span className="text-red-400">
                            Warning: Only enable this if you absolutely need it.
                            Never share this key.
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <HiPlus className="w-5 h-5" />
                      {isLoading ? "Creating..." : "Create Key"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 h-full">
            <h3 className="font-semibold text-white mb-3">Rate Limits</h3>
            <div className="space-y-2 text-sm text-zinc-400">
              <p>
                You can make up to{" "}
                <span className="text-white font-medium">
                  1,000 requests per hour
                </span>{" "}
                per key.
              </p>
              <p>
                <span className="text-red-400 font-medium">
                  Uploads are strictly limited to 100 requests per hour.
                </span>
              </p>
              <p>
                To prevent abuse, all requests have an artificial{" "}
                <span className="text-white font-medium">2-second delay</span>{" "}
                and are limited to 1 request every 2 seconds.
              </p>
              <p className="pt-2 border-t border-zinc-800">
                Need more? Just ask in Slack! Also you only get access to public
                photos.
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <HiCodeBracket className="w-5 h-5" />
            The Docs
          </h2>
        </div>

        <div className="p-6">
          <p className="text-zinc-400 mb-8">
            Want to build something cool with Hack Club photos? You're in the
            right place. Grab an API key above and start hacking.
          </p>

          <div className="mb-8">
            <h3 className="text-lg font-medium text-white mb-4">
              Authentication
            </h3>
            <p className="text-zinc-400 mb-4 text-sm">
              Just toss your API key in the header and you're good to go:
            </p>
            <div className="bg-black p-4 rounded-lg border border-zinc-800 overflow-x-auto">
              <code className="text-sm text-red-300">
                Authorization: Bearer YOUR_API_KEY
              </code>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-medium text-white mb-4">
              REST API Playground
            </h3>
            <p className="text-zinc-400 mb-6 text-sm">
              Pick an endpoint, tweak the settings, and see what happens.
            </p>
            <ApiPlayground />
          </div>
        </div>
      </section>
      <ConfirmModal
        isOpen={showUploadWarningModal}
        onClose={() => setShowUploadWarningModal(false)}
        onConfirm={submitCreateKey}
        title="Security Warning"
        message={
          <div className="space-y-4">
            <p className="text-zinc-300">
              You are responsible for all content uploaded with this key.
            </p>
            <p className="text-zinc-300">
              If this key leaks and is used to upload inappropriate content, you
              will be held accountable. Please be careful and ensure your key is
              kept secure.
            </p>
            <p className="text-zinc-300 font-medium">
              Only create this key if you absolutely need programmatic upload
              access.
            </p>
          </div>
        }
        confirmText="I Understand, Create Key"
        danger={true}
        timerSeconds={10}
        disabled={isLoading}
      />
    </div>
  );
}
