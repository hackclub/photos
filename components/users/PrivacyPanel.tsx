"use client";

import { useEffect, useState, useTransition } from "react";
import { HiShieldCheck, HiTrash } from "react-icons/hi2";
import {
  deleteAllFaceData,
  getPrivacyOverview,
  updatePrivacyPreferences,
} from "@/app/actions/privacy";
import ConfirmModal from "@/components/ui/ConfirmModal";

type Overview = Awaited<ReturnType<typeof getPrivacyOverview>>;

export default function PrivacyPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getPrivacyOverview()
      .then(setOverview)
      .catch(() => setError("Could not load privacy settings."));
  }, []);

  if (!overview) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-500">
        {error || "Loading privacy settings..."}
      </div>
    );
  }

  const preferences = overview.preferences;
  function update(key: keyof typeof preferences, value: boolean) {
    const previous = overview!;
    const next = { ...preferences, [key]: value };
    setError(null);
    setOverview({ ...overview!, preferences: next });
    startTransition(async () => {
      try {
        await updatePrivacyPreferences({
          matchingEnabled: next.matchingEnabled,
          autoSuggestionsEnabled: next.autoSuggestionsEnabled,
          hideProfile: next.hideProfile,
          hideMentions: next.hideMentions,
          hideAiSuggestions: next.hideAiSuggestions,
        });
      } catch {
        setOverview(previous);
        setError("Could not save privacy settings. Try again.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <DataCount label="Saved face scans" value={overview.counts.faceScans} />
        <DataCount
          label="AI suggestions"
          value={overview.counts.faceSuggestions}
        />
        <DataCount
          label="Confirmed mentions"
          value={overview.counts.mentions}
        />
      </div>
      <div className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <Preference
          label="Public profile"
          description="Anyone can open your profile."
          checked={!preferences.hideProfile}
          disabled={isPending}
          onChange={(value) => update("hideProfile", !value)}
        />
        <Preference
          label="Share mentions"
          description="Other people can view the mentions tab on your profile."
          checked={!preferences.hideMentions}
          disabled={isPending}
          onChange={(value) => update("hideMentions", !value)}
        />
        <Preference
          label="Share AI suggestions"
          description="Suggested matches can appear publicly until confirmed or dismissed."
          checked={!preferences.hideAiSuggestions}
          disabled={isPending}
          onChange={(value) => update("hideAiSuggestions", !value)}
        />
        <Preference
          label="Face matching"
          description="Allow saved scans to be used for Includes me and blur requests."
          checked={preferences.matchingEnabled}
          disabled={isPending || overview.counts.faceScans === 0}
          onChange={(value) => update("matchingEnabled", value)}
        />
        <Preference
          label="Automatic suggestions"
          description="Look for you in events you join using your latest scan."
          checked={preferences.autoSuggestionsEnabled}
          disabled={isPending || !preferences.matchingEnabled}
          onChange={(value) => update("autoSuggestionsEnabled", value)}
        />
      </div>
      <div className="flex items-start justify-between gap-4 rounded-xl border border-red-950 bg-red-950/20 p-4">
        <div>
          <p className="flex items-center gap-2 font-medium text-white">
            <HiShieldCheck className="h-5 w-5 text-red-400" /> Face data
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Delete every saved template, pending suggestion, and future blur
            subscription.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={overview.counts.faceScans === 0 || isPending}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-900 px-3 py-2 text-sm font-medium text-red-300 disabled:opacity-40"
        >
          <HiTrash className="h-4 w-4" /> Delete
        </button>
      </div>
      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          startTransition(async () => {
            await deleteAllFaceData();
            setConfirmDelete(false);
            setOverview(await getPrivacyOverview());
          });
        }}
        title="Delete all face data"
        message="This removes saved face templates and AI suggestions. Confirmed mentions and approved blur results remain."
        confirmText="Delete face data"
        cancelText="Cancel"
        danger
      />
    </div>
  );
}

function DataCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function Preference({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-5 p-4">
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="mt-1 block text-xs text-zinc-500">{description}</span>
      </span>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-red-600 disabled:opacity-40"
      />
    </label>
  );
}
