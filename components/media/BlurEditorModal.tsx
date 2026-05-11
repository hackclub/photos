"use client";
import { type PointerEvent, useEffect, useState } from "react";
import { HiXMark } from "react-icons/hi2";
import type { MediaItem } from "@/types/media";

export type BlurRect = { x: number; y: number; width: number; height: number };
export type BlurDraft = {
  media: MediaItem;
  regions: BlurRect[];
  previewDataUrl: string;
};

export function BlurEditorModal({
  media,
  imageUrl,
  existing,
  onRefresh,
  onClose,
  onSave,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
}: {
  media: MediaItem;
  imageUrl?: string | null;
  existing?: BlurDraft;
  onRefresh: () => void;
  onClose: () => void;
  onSave: (draft: BlurDraft) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}) {
  const [regions, setRegions] = useState<BlurRect[]>(existing?.regions ?? []);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<BlurRect | null>(null);
  const activeRegions = current ? [...regions, current] : regions;

  useEffect(() => {
    setRegions(existing?.regions ?? []);
    setStart(null);
    setCurrent(null);
  }, [existing]);

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
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 p-2 sm:p-4">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 p-3">
          <div>
            <p className="font-bold text-white">Blur Me</p>
            <p className="text-xs text-zinc-400">
              Draw boxes, save, then keep moving through photos.
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
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
          {hasPrevious && (
            <button
              type="button"
              onClick={onPrevious}
              className="absolute left-4 z-20 rounded-full bg-black/70 px-4 py-3 text-3xl leading-none text-white hover:bg-black/90"
              aria-label="Previous photo"
            >
              ‹
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              onClick={onNext}
              className="absolute right-4 z-20 rounded-full bg-black/70 px-4 py-3 text-3xl leading-none text-white hover:bg-black/90"
              aria-label="Next photo"
            >
              ›
            </button>
          )}
          {imageUrl ? (
            <div
              className="relative max-h-full max-w-full touch-none select-none overflow-hidden rounded-xl"
              onDragStart={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                const p = point(e);
                setStart(p);
                setCurrent({ ...p, width: 0, height: 0 });
              }}
              onPointerMove={(e) => {
                e.preventDefault();
                if (!start) return;
                const p = point(e);
                setCurrent({
                  x: Math.min(start.x, p.x),
                  y: Math.min(start.y, p.y),
                  width: Math.abs(p.x - start.x),
                  height: Math.abs(p.y - start.y),
                });
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                if (current && current.width > 0.01 && current.height > 0.01) {
                  setRegions((prev) => [...prev, current]);
                }
                setStart(null);
                setCurrent(null);
              }}
            >
              <img
                src={imageUrl}
                alt={media.filename}
                onError={onRefresh}
                draggable={false}
                className="max-h-[72vh] max-w-full select-none object-contain"
              />
              {activeRegions.map((r, index) => (
                <div
                  key={`${r.x}-${r.y}-${index}`}
                  className="absolute border-2 border-red-400 bg-red-500/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.02)]"
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={activeRegions.length === 0 || !imageUrl}
              className="rounded-xl bg-red-600 px-5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              Save blur
            </button>
            {hasNext && (
              <button
                type="button"
                onClick={onNext}
                className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-700"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export async function buildBlurPreview(src: string, regions: BlurRect[]) {
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
