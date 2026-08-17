"use client";
import { useEffect, useState } from "react";
import { HiCheck, HiClock, HiSparkles, HiXMark } from "react-icons/hi2";
import {
  submitBlurRequests,
  submitFaceBlurRequests,
} from "@/app/actions/blur-requests";
import IncludesMeDrawer from "@/components/face/IncludesMeDrawer";
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
      <div className="sticky top-4 z-30 rounded-2xl border border-red-500/30 bg-red-950/70 p-4 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-white">Blur Me mode</p>
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 p-4">
      <div className="mx-auto max-w-6xl rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <HiSparkles className="h-5 w-5 text-cyan-400" /> Review matches
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              High-confidence matches are selected. Remove anything that is not
              you.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              After you submit, new matching photos uploaded to this event will
              also be sent for blur review automatically.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-zinc-400">
            <HiXMark className="h-6 w-6" />
          </button>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
            <p className="font-medium text-white">
              No high-confidence matches found.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              The event may still be indexing. Close this and try again shortly.
            </p>
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
                  className={`overflow-hidden rounded-xl border text-left transition ${
                    checked
                      ? "border-cyan-500 bg-cyan-950/20"
                      : "border-zinc-800 bg-zinc-900 opacity-55"
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
                    <span
                      className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full ${
                        checked
                          ? "bg-cyan-500 text-zinc-950"
                          : "bg-zinc-950 text-zinc-500"
                      }`}
                    >
                      {checked ? <HiCheck className="h-4 w-4" /> : null}
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="truncate text-xs text-zinc-300">
                      {item.filename}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {Math.round(match.similarity * 100)}% confidence
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={submitting || selected.size === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white disabled:bg-zinc-700"
          >
            {submitting ? <HiClock className="h-4 w-4 animate-spin" /> : null}
            Submit {selected.size} for review
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
