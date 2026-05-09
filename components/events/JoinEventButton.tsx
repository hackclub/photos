"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { joinEvent } from "@/app/actions/events";
import { trackRybbitEvent } from "@/components/analytics/RybbitUserIdentifier";

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
      trackRybbitEvent("event_join_started", {
        event_id: eventId,
        requires_invite: requiresInvite,
        has_invite_code: Boolean(codeOverride || inviteCode),
        source: codeOverride ? "invite_url" : "button",
      });
      try {
        const codeToUse = codeOverride || inviteCode;
        const result = await joinEvent(
          eventId,
          requiresInvite ? codeToUse : undefined,
        );
        if (result.success) {
          trackRybbitEvent("event_joined", {
            event_id: eventId,
            requires_invite: requiresInvite,
            source: codeOverride ? "invite_url" : "button",
          });
          router.refresh();
        } else {
          trackRybbitEvent("event_join_failed", {
            event_id: eventId,
            requires_invite: requiresInvite,
            error: result.error || "unknown",
          });
          alert(result.error || "Failed to join event");
        }
      } catch (_error) {
        trackRybbitEvent("event_join_failed", {
          event_id: eventId,
          requires_invite: requiresInvite,
          error: "client_exception",
        });
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
        onClick={() => {
          trackRybbitEvent("event_invite_prompt_opened", { event_id: eventId });
          setShowInviteInput(true);
        }}
        className="min-h-11 rounded-xl bg-red-600 px-6 py-2 text-center font-medium transition hover:bg-red-700"
      >
        Join Event (Invite Required)
      </button>
    );
  }
  if (requiresInvite && showInviteInput) {
    return (
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <input
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="Enter invite code"
          className="min-h-11 rounded-xl bg-zinc-800 px-4 py-2"
        />
        <button
          type="button"
          onClick={() => handleJoin()}
          disabled={loading || !inviteCode}
          className="min-h-11 rounded-xl bg-red-600 px-6 py-2 font-medium transition hover:bg-red-700 disabled:opacity-50"
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
      className="min-h-11 w-full rounded-xl bg-red-600 px-6 py-2 text-center font-medium transition hover:bg-red-700 disabled:opacity-50 sm:w-auto"
    >
      {loading ? "Joining..." : "Join Event"}
    </button>
  );
}
