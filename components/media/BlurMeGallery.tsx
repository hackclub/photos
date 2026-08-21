"use client";
import { useEffect, useState } from "react";
import { HiXMark } from "react-icons/hi2";
import {
  submitBlurRequests,
  submitFaceBlurRequests,
} from "@/app/actions/blur-requests";
import IncludesMeDrawer from "@/components/face/IncludesMeDrawer";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
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
  const [faceDrawerOpen, setFaceDrawerOpen] = useState(false);
  const [faceReviewing, setFaceReviewing] = useState(false);
  const [faceMatches, setFaceMatches] = useState<FaceMatch[]>([]);
  const [faceScanId, setFaceScanId] = useState<string | null>(null);

  useEffect(() => {
    const toggle = () => {
      setSubmitted(false);
      if (enabled && Object.keys(drafts).length > 0) {
        setReviewing(true);
        return;
      }
      setFaceDrawerOpen(true);
    };
    window.addEventListener("blur-me-toggle", toggle);
    return () => window.removeEventListener("blur-me-toggle", toggle);
  }, [drafts, enabled]);

  if (!enabled) {
    return (
      <div className="space-y-4">
        {submitted && (
          <p className="border-b border-zinc-800 pb-4 text-sm text-zinc-300">
            Sent. We&apos;ll review it.
          </p>
        )}
        <MediaGallery
          media={media}
          events={events}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          eventId={eventId}
          initialPhotoId={initialPhotoId}
          liveScopeType="event"
          liveScopeId={eventId}
        />
        {eventId && currentUserId ? (
          <IncludesMeDrawer
            eventId={eventId}
            open={faceDrawerOpen}
            mode="blur"
            onClose={() => setFaceDrawerOpen(false)}
            onManual={() => {
              setFaceDrawerOpen(false);
              setEnabled(true);
            }}
            onApply={(matches, scanId) => {
              setFaceMatches(matches);
              setFaceScanId(scanId);
              setFaceDrawerOpen(false);
              setFaceReviewing(true);
            }}
          />
        ) : null}
        {faceReviewing && eventId && faceScanId ? (
          <FaceBlurReviewModal
            eventId={eventId}
            scanId={faceScanId}
            media={media}
            matches={faceMatches}
            onClose={() => setFaceReviewing(false)}
            onSubmitted={() => {
              setFaceReviewing(false);
              setFaceMatches([]);
              setSubmitted(true);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950 px-1 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white">Choose photos</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setReviewing(true)}
              disabled={Object.keys(drafts).length === 0}
              className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              Review ({Object.keys(drafts).length})
            </button>
            <button
              type="button"
              onClick={() => {
                setEnabled(false);
                setReviewing(false);
              }}
              className="min-h-11 px-3 text-sm text-zinc-400 hover:text-white"
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

type FaceMatch = {
  detectionId: string;
  mediaId: string;
  similarity: number;
  region: { x: number; y: number; width: number; height: number };
};

function FaceBlurReviewModal({
  eventId,
  scanId,
  media,
  matches,
  onClose,
  onSubmitted,
}: {
  eventId: string;
  scanId: string;
  media: MediaItem[];
  matches: FaceMatch[];
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const bestByMedia = new Map<string, FaceMatch>();
  const matchCountByMedia = new Map<string, number>();
  for (const match of matches) {
    matchCountByMedia.set(
      match.mediaId,
      (matchCountByMedia.get(match.mediaId) ?? 0) + 1,
    );
    const current = bestByMedia.get(match.mediaId);
    if (!current || match.similarity > current.similarity) {
      bestByMedia.set(match.mediaId, match);
    }
  }
  const rows = Array.from(bestByMedia.values()).flatMap((match) => {
    const item = media.find((candidate) => candidate.id === match.mediaId);
    return item ? [{ item, match }] : [];
  });
  const [selected, setSelected] = useState(
    () => new Set(rows.map((row) => row.match.detectionId)),
  );
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    const result = await submitFaceBlurRequests({
      eventId,
      scanId,
      detectionIds: Array.from(selected),
    });
    setSubmitting(false);
    if (result.success) onSubmitted();
    else alert(result.error || "Failed to submit blur requests");
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950 sm:bg-black/90 sm:p-4">
      <div
        className="mx-auto min-h-dvh max-w-6xl bg-zinc-950 p-5 sm:min-h-0 sm:rounded-2xl sm:border sm:border-zinc-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="face-blur-review-title"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2
              id="face-blur-review-title"
              className="text-xl font-semibold text-white"
            >
              Choose photos
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Tap any photo that is not you.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400"
            aria-label="Close"
          >
            <HiXMark className="h-6 w-6" />
          </button>
        </div>
        {rows.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-medium text-white">No matches yet</p>
            <p className="mt-2 text-sm text-zinc-500">Try again later.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {rows.map(({ item, match }) => {
              const checked = selected.has(match.detectionId);
              const multipleFaces = (matchCountByMedia.get(item.id) ?? 0) > 1;
              const centerX = (match.region.x + match.region.width / 2) * 100;
              const centerY = (match.region.y + match.region.height / 2) * 100;
              return (
                <button
                  key={match.detectionId}
                  type="button"
                  onClick={() =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.delete(match.detectionId);
                      else next.add(match.detectionId);
                      return next;
                    })
                  }
                  aria-pressed={checked}
                  aria-label={`${checked ? "Remove" : "Add"} ${item.filename}`}
                  className={`relative aspect-square overflow-hidden rounded-lg border text-left transition ${
                    checked
                      ? "border-white opacity-100 ring-1 ring-white"
                      : "border-zinc-800 opacity-40"
                  }`}
                >
                  <div
                    className="relative aspect-square bg-zinc-800 bg-cover bg-no-repeat"
                    style={{
                      backgroundImage: `url(/media/${item.id}/thumbnail)`,
                      backgroundPosition: multipleFaces
                        ? "center"
                        : `${centerX}% ${centerY}%`,
                      backgroundSize: multipleFaces ? "cover" : "240%",
                    }}
                  >
                    {checked ? (
                      <span className="absolute right-2 top-2 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-950">
                        Selected
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div className="sticky bottom-0 mt-6 border-t border-zinc-800 bg-zinc-950 py-4">
          <p className="mb-3 text-xs text-zinc-500">
            New matches from this event will be checked too.
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || selected.size === 0}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white disabled:bg-zinc-700"
          >
            {submitting ? <LoadingSpinner size="sm" /> : null}
            {submitting ? "Sending..." : `Send ${selected.size}`}
          </button>
        </div>
      </div>
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
      })),
    );
    setSubmitting(false);
    if (result.success) onSubmitted();
    else alert(result.error || "Failed to submit blur requests");
  };
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950 sm:bg-black/90 sm:p-4">
      <div
        className="mx-auto min-h-dvh max-w-5xl bg-zinc-950 p-5 sm:min-h-0 sm:rounded-2xl sm:border sm:border-zinc-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="blur-review-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2
              id="blur-review-title"
              className="text-xl font-semibold text-white"
            >
              Check photos
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white"
            aria-label="Close"
          >
            <HiXMark className="h-6 w-6" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {drafts.map((draft) => (
            <div key={draft.media.id}>
              <img
                src={draft.previewDataUrl}
                alt={draft.media.filename}
                className="aspect-square w-full rounded-lg border border-zinc-800 object-cover"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="truncate text-xs text-zinc-400">
                  {draft.media.filename}
                </p>
                <button
                  type="button"
                  onClick={() => onRemove(draft.media.id)}
                  className="min-h-10 px-2 text-xs font-medium text-zinc-400 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 mt-6 flex justify-end gap-2 border-t border-zinc-800 bg-zinc-950 py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 px-4 text-sm font-medium text-zinc-400 hover:text-white"
          >
            Back
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || drafts.length === 0}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-red-600 px-6 text-sm font-semibold text-white disabled:bg-zinc-700"
          >
            {submitting ? <LoadingSpinner size="sm" /> : null}
            {submitting ? "Sending..." : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
