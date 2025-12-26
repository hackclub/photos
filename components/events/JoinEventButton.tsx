"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { joinEvent } from "@/app/actions/events";

interface Props {
  eventId: string;
  requiresInvite: boolean;
}
export default function JoinEventButton({ eventId, requiresInvite }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const handleJoin = useCallback(
    async (codeOverride?: string) => {
      setLoading(true);
      try {
        const codeToUse = codeOverride || inviteCode;
        const result = await joinEvent(
          eventId,
          requiresInvite ? codeToUse : undefined,
        );
        if (result.success) {
          router.refresh();
        } else {
          alert(result.error || "Failed to join event");
        }
      } catch (_error) {
        alert("Failed to join event");
      } finally {
        setLoading(false);
      }
    },
    [eventId, inviteCode, requiresInvite, router],
  );
  useEffect(() => {
    const inviteFromUrl = searchParams.get("invite");
    if (inviteFromUrl) {
      setInviteCode(inviteFromUrl);
      if (requiresInvite) {
        handleJoin(inviteFromUrl);
      }
    }
  }, [searchParams, requiresInvite, handleJoin]);
  if (requiresInvite && !showInviteInput) {
    return (
      <button
        type="button"
        onClick={() => setShowInviteInput(true)}
        className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition"
      >
        Join Event (Invite Required)
      </button>
    );
  }
  if (requiresInvite && showInviteInput) {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="Enter invite code"
          className="px-4 py-2 bg-zinc-800 rounded-lg"
        />
        <button
          type="button"
          onClick={() => handleJoin()}
          disabled={loading || !inviteCode}
          className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50"
        >
          {loading ? "Joining..." : "Join"}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => handleJoin()}
      disabled={loading}
      className="w-full sm:w-auto px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50 text-center"
    >
      {loading ? "Joining..." : "Join Event"}
    </button>
  );
}
