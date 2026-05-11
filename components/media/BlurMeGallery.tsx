"use client";
import { useEffect, useState } from "react";
import { HiClock, HiXMark } from "react-icons/hi2";
import { submitBlurRequests } from "@/app/actions/blur-requests";
import type { Event, MediaItem } from "@/types/media";
import type { BlurDraft, BlurRect } from "./BlurEditorModal";
import MediaGallery from "./MediaGallery";

type Draft = BlurDraft;

export default function BlurMeGallery({
  media,
  events = [],
  currentUserId,
  isAdmin,
  eventId,
  initialPhotoId,
}: {
  media: MediaItem[];
  events?: Event[];
  currentUserId?: string;
  isAdmin?: boolean;
  eventId?: string;
  initialPhotoId?: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    const toggle = () => {
      setSubmitted(false);
      if (enabled && Object.keys(drafts).length > 0) {
        setReviewing(true);
        return;
      }
      setEnabled((value) => !value);
    };
    window.addEventListener("blur-me-toggle", toggle);
    return () => window.removeEventListener("blur-me-toggle", toggle);
  }, [drafts, enabled]);

  if (!enabled) {
    return (
      <div className="space-y-4">
        {submitted && (
          <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-300">
            Thanks for submitting. An admin will review these submissions ASAP.
          </div>
        )}
        <MediaGallery
          media={media}
          events={events}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          eventId={eventId}
          initialPhotoId={initialPhotoId}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-4 z-30 rounded-2xl border border-red-500/30 bg-red-950/70 p-4 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-white">Blur Me mode</p>
            <p className="text-sm text-red-100/80">
              Open photos, draw boxes, save drafts, submit all at once.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setReviewing(true)}
              disabled={Object.keys(drafts).length === 0}
              className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-red-700 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              Blur Me ({Object.keys(drafts).length})
            </button>
            <button
              type="button"
              onClick={() => {
                setEnabled(false);
                setReviewing(false);
              }}
              className="rounded-xl border border-white/20 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
      <MediaGallery
        media={media}
        events={events}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        eventId={eventId}
        initialPhotoId={initialPhotoId}
        blurMode={true}
        blurDrafts={drafts}
        onBlurDraft={(draft) =>
          setDrafts((prev) => ({ ...prev, [draft.media.id]: draft }))
        }
      />
      {reviewing && (
        <BlurReviewModal
          drafts={Object.values(drafts)}
          onClose={() => setReviewing(false)}
          onRemove={(id) =>
            setDrafts((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            })
          }
          onSubmitted={() => {
            setDrafts({});
            setReviewing(false);
            setEnabled(false);
            setSubmitted(true);
          }}
        />
      )}
    </div>
  );
}

function BlurReviewModal({
  drafts,
  onClose,
  onRemove,
  onSubmitted,
}: {
  drafts: Draft[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onSubmitted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    setSubmitting(true);
    const result = await submitBlurRequests(
      drafts.map((d) => ({
        mediaId: d.media.id,
        regions: d.regions as BlurRect[],
        previewDataUrl: d.previewDataUrl,
      })),
    );
    setSubmitting(false);
    if (result.success) onSubmitted();
    else alert(result.error || "Failed to submit blur requests");
  };
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 p-4">
      <div className="mx-auto max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">
              Review blur requests
            </h2>
            <p className="text-sm text-zinc-400">
              Preview before admin review.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white"
          >
            <HiXMark className="h-6 w-6" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {drafts.map((draft) => (
            <div
              key={draft.media.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-2"
            >
              <img
                src={draft.previewDataUrl}
                alt={draft.media.filename}
                className="aspect-square w-full rounded-lg object-cover"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="truncate text-xs text-zinc-400">
                  {draft.media.filename}
                </p>
                <button
                  type="button"
                  onClick={() => onRemove(draft.media.id)}
                  className="text-xs font-bold text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white"
          >
            Back
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || drafts.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-sm font-bold text-white disabled:bg-zinc-700"
          >
            {submitting && <HiClock className="h-4 w-4 animate-spin" />}Submit
          </button>
        </div>
      </div>
    </div>
  );
}
