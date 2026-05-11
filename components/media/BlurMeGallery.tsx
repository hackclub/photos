"use client";
import { type PointerEvent, useRef, useState } from "react";
import { HiClock, HiEyeSlash, HiPhoto, HiXMark } from "react-icons/hi2";
import { submitBlurRequests } from "@/app/actions/blur-requests";
import { useMediaGalleryData } from "@/hooks/useMediaGallery";
import type { Event, MediaItem } from "@/types/media";
import MediaGallery from "./MediaGallery";

type Rect = { x: number; y: number; width: number; height: number };
type Draft = { media: MediaItem; regions: Rect[]; previewDataUrl: string };

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

  if (!enabled) {
    return (
      <div className="space-y-4">
        <BlurMeBar
          count={Object.keys(drafts).length}
          submitted={submitted}
          onToggle={() => {
            setEnabled(true);
            setSubmitted(false);
          }}
        />
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
      <BlurModeGrid
        media={media}
        events={events}
        drafts={drafts}
        onDraft={(draft) =>
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

function BlurMeBar({
  count,
  submitted,
  onToggle,
}: {
  count: number;
  submitted: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-bold text-white">Need privacy blur?</p>
        <p className="text-sm text-zinc-400">
          {submitted
            ? "Thanks for submitting. An admin will review these submissions ASAP."
            : "Select photos, draw boxes, preview blur, submit one request."}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
      >
        <HiEyeSlash className="h-5 w-5" />
        Blur Me{count > 0 ? ` (${count})` : ""}
      </button>
    </div>
  );
}

function BlurModeGrid({
  media,
  events,
  drafts,
  onDraft,
}: {
  media: MediaItem[];
  events: Event[];
  drafts: Record<string, Draft>;
  onDraft: (draft: Draft) => void;
}) {
  const {
    sortedMedia,
    presignedUrls,
    loadThumbnailUrls,
    selectedMedia,
    setSelectedMedia,
    fullSizeUrl,
    refreshFullSizeUrl,
  } = useMediaGalleryData(media, events);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {sortedMedia.map((item) => (
          <button
            key={item.id}
            type="button"
            onMouseEnter={() => void loadThumbnailUrls([item])}
            onClick={() => {
              void loadThumbnailUrls([item]);
              setSelectedMedia(item);
            }}
            className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 text-left focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            {presignedUrls[item.id] ? (
              <img
                src={presignedUrls[item.id]}
                alt={item.filename}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <HiPhoto className="h-10 w-10 text-zinc-600" />
              </div>
            )}
            {drafts[item.id] && (
              <div className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white">
                Selected
              </div>
            )}
          </button>
        ))}
      </div>
      {selectedMedia && (
        <BlurEditorModal
          media={selectedMedia}
          imageUrl={fullSizeUrl || presignedUrls[selectedMedia.id]}
          existing={drafts[selectedMedia.id]}
          onRefresh={() => refreshFullSizeUrl(selectedMedia)}
          onClose={() => setSelectedMedia(null)}
          onSave={onDraft}
        />
      )}
    </>
  );
}

function BlurEditorModal({
  media,
  imageUrl,
  existing,
  onRefresh,
  onClose,
  onSave,
}: {
  media: MediaItem;
  imageUrl?: string | null;
  existing?: Draft;
  onRefresh: () => void;
  onClose: () => void;
  onSave: (draft: Draft) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [regions, setRegions] = useState<Rect[]>(existing?.regions ?? []);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<Rect | null>(null);
  const activeRegions = current ? [...regions, current] : regions;

  const point = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };
  const save = async () => {
    if (!imageUrl || activeRegions.length === 0) return;
    const previewDataUrl = await buildBlurPreview(imageUrl, activeRegions);
    onSave({ media, regions: activeRegions, previewDataUrl });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 p-3 sm:p-6">
      <div className="mx-auto flex h-full max-w-6xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 p-3">
          <div>
            <p className="font-bold text-white">Draw blur box</p>
            <p className="text-xs text-zinc-400">
              Drag over face/body area. Multiple boxes OK.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <HiXMark className="h-6 w-6" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-3">
          {imageUrl ? (
            <div
              className="relative max-h-full max-w-full touch-none select-none overflow-hidden rounded-xl"
              onPointerDown={(e) => {
                const p = point(e);
                setStart(p);
                setCurrent({ ...p, width: 0, height: 0 });
              }}
              onPointerMove={(e) => {
                if (!start) return;
                const p = point(e);
                setCurrent({
                  x: Math.min(start.x, p.x),
                  y: Math.min(start.y, p.y),
                  width: Math.abs(p.x - start.x),
                  height: Math.abs(p.y - start.y),
                });
              }}
              onPointerUp={() => {
                if (current && current.width > 0.01 && current.height > 0.01)
                  setRegions((prev) => [...prev, current]);
                setStart(null);
                setCurrent(null);
              }}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt={media.filename}
                onError={onRefresh}
                className="max-h-[70vh] max-w-full object-contain"
              />
              {activeRegions.map((r, index) => (
                <div
                  key={`${r.x}-${r.y}-${index}`}
                  className="absolute border-2 border-red-400 bg-red-500/20"
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.width * 100}%`,
                    height: `${r.height * 100}%`,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="text-zinc-400">Loading photo...</div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 p-3">
          <button
            type="button"
            onClick={() => setRegions([])}
            className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-700"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={save}
            disabled={activeRegions.length === 0 || !imageUrl}
            className="rounded-xl bg-red-600 px-5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            Save blur for photo
          </button>
        </div>
      </div>
    </div>
  );
}

async function buildBlurPreview(src: string, regions: Rect[]) {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  for (const r of regions) {
    const x = Math.round(r.x * canvas.width);
    const y = Math.round(r.y * canvas.height);
    const w = Math.round(r.width * canvas.width);
    const h = Math.round(r.height * canvas.height);
    ctx.save();
    ctx.filter = "blur(12px)";
    ctx.drawImage(canvas, x, y, w, h, x, y, w, h);
    ctx.restore();
  }
  return canvas.toDataURL("image/jpeg", 0.9);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
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
        regions: d.regions,
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
