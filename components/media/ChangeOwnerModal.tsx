"use client";

import { useEffect, useRef, useState } from "react";
import { HiCheck, HiUser, HiXMark } from "react-icons/hi2";
import {
  reserveMediaOwnership,
  resolveSlackId,
  searchOwnerCandidates,
  transferMediaOwnership,
} from "@/app/actions/ownership";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface UserOption {
  id: string;
  name: string;
  handle: string | null;
  slackId: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mediaIds: string[];
  onComplete: () => void;
}

export default function ChangeOwnerModal({
  isOpen,
  onClose,
  mediaIds,
  onComplete,
}: Props) {
  const [query, setQuery] = useState("");
  const [slackIdInput, setSlackIdInput] = useState("");
  const [searchResults, setSearchResults] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvingSlackId, setResolvingSlackId] = useState(false);
  const [resolvedSlackUser, setResolvedSlackUser] = useState<UserOption | null>(
    null,
  );
  const [resolvedSlackIdOnly, setResolvedSlackIdOnly] = useState<string | null>(
    null,
  );
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [showPlaceholder, setShowPlaceholder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const slackInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSlackIdInput("");
      setSearchResults([]);
      setResolvedSlackUser(null);
      setResolvedSlackIdOnly(null);
      setSelectedUser(null);
      setShowPlaceholder(false);
      setSubmitting(false);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const doSearch = (q: string) => {
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchOwnerCandidates(q).then((res) => {
      if (res.success) {
        setSearchResults(res.users ?? []);
      }
      setSearching(false);
    });
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setSelectedUser(null);
    setResolvedSlackUser(null);
    setResolvedSlackIdOnly(null);
    setSlackIdInput("");
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => doSearch(val), 250);
  };

  const handleSlackIdChange = (val: string) => {
    setSlackIdInput(val);
    setSelectedUser(null);
    setResolvedSlackUser(null);
    setResolvedSlackIdOnly(null);
    setQuery("");
  };

  const handleResolveSlackId = async () => {
    if (!slackIdInput.trim()) return;
    setResolvingSlackId(true);
    setError(null);
    const res = await resolveSlackId(slackIdInput.trim());
    if (res.success) {
      if (res.existingUser && res.user) {
        setResolvedSlackUser(res.user);
        setSelectedUser(res.user);
        setResolvedSlackIdOnly(null);
      } else if (res.slackId) {
        setResolvedSlackIdOnly(res.slackId);
        setResolvedSlackUser(null);
        setSelectedUser(null);
      }
    } else {
      setError(res.error ?? "Failed to resolve Slack ID");
    }
    setResolvingSlackId(false);
  };

  const handleSelectUser = (user: UserOption) => {
    setSelectedUser(user);
    setSlackIdInput("");
    setResolvedSlackUser(null);
    setResolvedSlackIdOnly(null);
    setSearchResults([]);
    setQuery(user.handle || user.name);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setError(null);

    if (selectedUser) {
      setSubmitting(true);
      const res = await transferMediaOwnership(mediaIds, selectedUser.id);
      if (res.success) {
        onComplete();
        onClose();
      } else {
        setError(res.error ?? "Failed to transfer ownership");
      }
      setSubmitting(false);
      return;
    }

    if (resolvedSlackIdOnly) {
      setSubmitting(true);
      const res = await reserveMediaOwnership(
        mediaIds,
        resolvedSlackIdOnly,
        showPlaceholder,
      );
      if (res.success) {
        onComplete();
        onClose();
      } else {
        setError(res.error ?? "Failed to reserve ownership");
      }
      setSubmitting(false);
      return;
    }

    setError("Search for an existing user or enter a valid Slack ID");
  };

  if (!isOpen) return null;

  const canSubmit = !!selectedUser || !!resolvedSlackIdOnly;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Change Owner</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
          >
            <HiXMark className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          <p className="text-sm text-zinc-400">
            Changing owner for{" "}
            <span className="text-white font-semibold">{mediaIds.length}</span>{" "}
            {mediaIds.length === 1 ? "photo" : "photos"}
          </p>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Search existing user
            </label>
            <div className="relative">
              <HiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search by name or handle..."
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 pl-10 pr-4 py-3 text-white placeholder-zinc-500 focus:border-red-600 focus:outline-none"
                disabled={!!resolvedSlackIdOnly}
              />
            </div>

            {searching && (
              <div className="mt-2 flex justify-center">
                <LoadingSpinner />
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="mt-2 border border-zinc-700 rounded-xl overflow-hidden">
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUser(u)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition border-b border-zinc-800 last:border-b-0"
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-white text-sm font-medium">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-white text-sm font-medium">
                        {u.name}
                      </div>
                      {u.handle && (
                        <div className="text-zinc-400 text-xs">@{u.handle}</div>
                      )}
                    </div>
                    {selectedUser?.id === u.id && (
                      <HiCheck className="w-5 h-5 text-red-600 ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-500">OR</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Enter Slack ID
            </label>
            <div className="flex gap-2">
              <input
                ref={slackInputRef}
                type="text"
                value={slackIdInput}
                onChange={(e) => handleSlackIdChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleResolveSlackId();
                }}
                placeholder="U01A2BC3DEF"
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-500 focus:border-red-600 focus:outline-none font-mono text-sm"
                disabled={!!selectedUser}
              />
              <button
                type="button"
                onClick={handleResolveSlackId}
                disabled={!slackIdInput.trim() || resolvingSlackId}
                className="rounded-xl bg-zinc-700 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {resolvingSlackId ? "..." : "Look up"}
              </button>
            </div>

            {resolvedSlackUser && (
              <div className="mt-2 px-4 py-3 border border-green-800 bg-green-900/30 rounded-xl">
                <div className="text-sm text-green-400 font-medium">
                  User found: {resolvedSlackUser.name}
                  {resolvedSlackUser.handle &&
                    ` (@${resolvedSlackUser.handle})`}
                </div>
                <div className="text-xs text-green-500 mt-1">
                  Ownership will transfer immediately
                </div>
              </div>
            )}

            {resolvedSlackIdOnly && (
              <div className="mt-2 space-y-3">
                <div className="px-4 py-3 border border-yellow-800 bg-yellow-900/30 rounded-xl">
                  <div className="text-sm text-yellow-400">
                    No user found with Slack ID{" "}
                    <code className="bg-yellow-900/50 px-1 py-0.5 rounded text-xs">
                      {resolvedSlackIdOnly}
                    </code>
                  </div>
                  <div className="text-xs text-yellow-500 mt-1">
                    Ownership will transfer when this person signs up
                  </div>
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPlaceholder}
                    onChange={(e) => setShowPlaceholder(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-red-600 focus:ring-red-600"
                  />
                  <div>
                    <div className="text-sm text-white font-medium">
                      Pending Registration
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      When off, the current owner stays visible. When on, the
                      photos will immediately show as owned by "Pending
                      Registration" until the user signs up.
                    </div>
                  </div>
                </label>
              </div>
            )}
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-900/30 border border-red-800 rounded-xl text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed transition"
          >
            {submitting
              ? "Processing..."
              : selectedUser
                ? `Transfer to ${selectedUser.name}`
                : resolvedSlackIdOnly
                  ? `Reserve for future user`
                  : "Change Owner"}
          </button>
        </div>
      </div>
    </div>
  );
}
