"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  HiArrowRightOnRectangle,
  HiExclamationTriangle,
  HiXMark,
} from "react-icons/hi2";
import { leaveEvent } from "@/app/actions/events";
import { trackRybbitEvent } from "@/components/analytics/RybbitUserIdentifier";

interface LeaveEventButtonProps {
  eventId: string;
  photoCount: number;
}
export default function LeaveEventButton({
  eventId,
  photoCount,
}: LeaveEventButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const router = useRouter();
  const handleLeave = async () => {
    setIsLeaving(true);
    trackRybbitEvent("event_leave_started", {
      event_id: eventId,
      photo_count: photoCount,
    });
    try {
      const result = await leaveEvent(eventId);
      if (result.success) {
        trackRybbitEvent("event_left", {
          event_id: eventId,
          photo_count: photoCount,
        });
        router.push("/events");
        router.refresh();
      } else {
        trackRybbitEvent("event_leave_failed", {
          event_id: eventId,
          photo_count: photoCount,
          error: result.error || "unknown",
        });
        alert(result.error || "Failed to leave event");
        setIsLeaving(false);
      }
    } catch (error) {
      console.error("Error leaving event:", error);
      trackRybbitEvent("event_leave_failed", {
        event_id: eventId,
        photo_count: photoCount,
        error: "client_exception",
      });
      alert("Failed to leave event");
      setIsLeaving(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          trackRybbitEvent("event_leave_dialog_opened", {
            event_id: eventId,
            photo_count: photoCount,
          });
          setShowDialog(true);
        }}
        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-all border border-zinc-700"
      >
        <HiArrowRightOnRectangle className="w-5 h-5" />
        <span>Leave Event</span>
      </button>

      {showDialog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-lg bg-red-600/10 border border-red-600/20 flex items-center justify-center flex-shrink-0">
                <HiExclamationTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-1">
                  Leave Event?
                </h3>
                <p className="text-zinc-400 text-sm">
                  This action cannot be undone
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  trackRybbitEvent("event_leave_dialog_closed", {
                    event_id: eventId,
                    photo_count: photoCount,
                  });
                  setShowDialog(false);
                }}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
                disabled={isLeaving}
              >
                <HiXMark className="w-6 h-6" />
              </button>
            </div>

            <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4 mb-6">
              <p className="text-white font-medium mb-2">
                All your photos will be permanently deleted
              </p>
              <p className="text-zinc-300 text-sm">
                {photoCount === 0
                  ? "You haven't uploaded any photos to this event yet."
                  : photoCount === 1
                    ? "You have 1 photo in this event that will be deleted."
                    : `You have ${photoCount} photos in this event that will be deleted.`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  trackRybbitEvent("event_leave_cancelled", {
                    event_id: eventId,
                    photo_count: photoCount,
                  });
                  setShowDialog(false);
                }}
                disabled={isLeaving}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-all border border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLeave}
                disabled={isLeaving}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isLeaving ? "Leaving..." : "Leave Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
