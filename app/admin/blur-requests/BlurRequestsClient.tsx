"use client";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { HiCheck, HiPlus, HiXMark } from "react-icons/hi2";
import {
  getBlurRequests,
  getBlurRequestUrls,
  resolveBlurRequest,
} from "@/app/actions/blur-requests";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

type Rect = { x: number; y: number; width: number; height: number };
type Request = {
  id: string;
  status: "pending" | "approved" | "rejected";
  regions: Rect[];
  createdAt: Date;
  media: { filename: string; id: string };
  requester: {
    preferredName?: string | null;
    handle?: string | null;
    name: string;
  };
};

export default function BlurRequestsClient() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = requests[selectedIndex] ?? null;

  useEffect(() => {
    void getBlurRequests().then((result) => {
      if (result.success && result.requests)
        setRequests(result.requests as Request[]);
      setLoading(false);
    });
  }, []);

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="space-y-2">
        {requests.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
            No blur requests.
          </div>
        ) : (
          requests.map((request, index) => (
            <button
              key={request.id}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === request.id ? "border-red-600 bg-red-950/20" : "border-zinc-800 bg-zinc-900 hover:border-red-600/50"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">
                    {request.media?.filename || "Deleted media"}
                  </p>
                  <p className="truncate text-sm text-zinc-500">
                    {request.requester?.preferredName ||
                      request.requester?.handle ||
                      "User"}
                  </p>
                </div>
                <StatusBadge status={request.status} />
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {request.regions?.length || 0} regions ·{" "}
                {new Date(request.createdAt).toLocaleString()}
              </p>
            </button>
          ))
        )}
      </div>
      {selected ? (
        <ReviewPanel
          request={selected}
          hasNext={selectedIndex < requests.length - 1}
          hasPrevious={selectedIndex > 0}
          onNext={() =>
            setSelectedIndex((i) => Math.min(i + 1, requests.length - 1))
          }
          onPrevious={() => setSelectedIndex((i) => Math.max(i - 1, 0))}
          onResolved={(status) => {
            setRequests((prev) =>
              prev.map((r) => (r.id === selected.id ? { ...r, status } : r)),
            );
            setSelectedIndex((i) =>
              Math.min(i + 1, Math.max(0, requests.length - 1)),
            );
          }}
        />
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-zinc-400">
          Select request.
        </div>
      )}
    </div>
  );
}

function ReviewPanel({
  request,
  hasNext,
  hasPrevious,
  onNext,
  onPrevious,
  onResolved,
}: {
  request: Request;
  hasNext: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onResolved: (status: "approved" | "rejected") => void;
}) {
  const [urls, setUrls] = useState<{
    originalUrl: string;
    blurredUrl: string;
  } | null>(null);
  const [regions, setRegions] = useState<Rect[]>(request.regions || []);
  const [selectedRegion, setSelectedRegion] = useState(0);
  const [blurIntensity, setBlurIntensity] = useState(12);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrls(null);
    setRegions(request.regions || []);
    setSelectedRegion(0);
    void getBlurRequestUrls(request.id).then((result) => {
      if (result.success && result.originalUrl && result.blurredUrl) {
        setUrls({
          originalUrl: result.originalUrl,
          blurredUrl: result.blurredUrl,
        });
      }
    });
  }, [request.id, request.regions]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (busy) return;
      if (event.key === "a") void approve();
      if (event.key === "r") void reject();
      if (event.key === "=")
        setBlurIntensity((value) => Math.min(24, value + 2));
      if (event.key === "-")
        setBlurIntensity((value) => Math.max(4, value - 2));
      if (event.key === "Backspace") removeSelected();
      if (event.key === "ArrowRight" && hasNext) onNext();
      if (event.key === "ArrowLeft" && hasPrevious) onPrevious();
      if (event.key >= "1" && event.key <= "9")
        setSelectedRegion(
          Math.min(Number(event.key) - 1, Math.max(0, regions.length - 1)),
        );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const removeSelected = () => {
    setRegions((prev) => prev.filter((_, index) => index !== selectedRegion));
    setSelectedRegion((index) => Math.max(0, index - 1));
  };
  const approve = async () => {
    if (!urls || regions.length === 0) return;
    setBusy(true);
    const preview = await buildBlurPreview(
      urls.originalUrl,
      regions,
      blurIntensity,
    );
    const result = await resolveBlurRequest(
      request.id,
      "approved",
      preview,
      regions,
    );
    setBusy(false);
    if (result.success) onResolved("approved");
    else alert(result.error || "Failed to approve request");
  };
  const reject = async () => {
    setBusy(true);
    const result = await resolveBlurRequest(
      request.id,
      "rejected",
      undefined,
      regions,
    );
    setBusy(false);
    if (result.success) onResolved("rejected");
    else alert(result.error || "Failed to reject request");
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
      <div className="border-b border-zinc-800 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Review blur</h2>
            <p className="text-sm text-zinc-400">
              Move boxes, add missing boxes, approve or reject. Keys: A approve,
              R reject, arrows next/prev, 1-9 select, Delete remove, +/- blur.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={busy}
              className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              <HiXMark className="mr-1 inline h-4 w-4" />
              Reject
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={busy || regions.length === 0}
              className="rounded-xl bg-red-600 px-5 py-2 text-sm font-bold text-white disabled:bg-zinc-700"
            >
              <HiCheck className="mr-1 inline h-4 w-4" />
              Approve
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[1fr_280px]">
        <div>
          {urls ? (
            <RegionEditor
              imageUrl={urls.originalUrl}
              regions={regions}
              selectedRegion={selectedRegion}
              onSelect={setSelectedRegion}
              onChange={setRegions}
            />
          ) : (
            <div className="flex justify-center py-20">
              <LoadingSpinner />
            </div>
          )}
        </div>
        <aside className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <div className="text-sm font-bold text-white">Blur boxes</div>
          <label className="block space-y-2 rounded-lg bg-zinc-950 p-3 text-sm text-zinc-300">
            <div className="flex items-center justify-between">
              <span>Blur intensity</span>
              <span className="font-mono text-zinc-500">{blurIntensity}px</span>
            </div>
            <input
              type="range"
              min="4"
              max="24"
              step="2"
              value={blurIntensity}
              onChange={(event) => setBlurIntensity(Number(event.target.value))}
              className="w-full accent-red-600"
            />
          </label>
          {regions.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No boxes selected. Drag on photo to add one before approving.
            </p>
          ) : (
            regions.map((region, index) => (
              <button
                key={`${region.x}-${region.y}-${index}`}
                type="button"
                onClick={() => setSelectedRegion(index)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm ${selectedRegion === index ? "border-red-600 bg-red-950/30 text-white" : "border-zinc-800 bg-zinc-950 text-zinc-300"}`}
              >
                <span>Region {index + 1}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setRegions((prev) => prev.filter((_, i) => i !== index));
                  }}
                  className="text-zinc-500 hover:text-red-400"
                >
                  deny
                </button>
              </button>
            ))
          )}
          <div className="rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">
            Partial accept = delete unwanted boxes, move boxes around, add
            missing boxes, then approve.
          </div>
        </aside>
      </div>
    </div>
  );
}

function RegionEditor({
  imageUrl,
  regions,
  selectedRegion,
  onSelect,
  onChange,
}: {
  imageUrl: string;
  regions: Rect[];
  selectedRegion: number;
  onSelect: (index: number) => void;
  onChange: (regions: Rect[]) => void;
}) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [moving, setMoving] = useState<{
    index: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const dragRef = useRef(false);
  const point = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const shown = draft ? [...regions, draft] : regions;
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 touch-none"
      onPointerDown={(event) => {
        dragRef.current = true;
        const p = point(event);
        setStart(p);
        setDraft({ ...p, width: 0, height: 0 });
      }}
      onPointerMove={(event) => {
        if (moving) {
          event.preventDefault();
          const p = point(event);
          onChange(
            regions.map((region, index) => {
              if (index !== moving.index) return region;
              return {
                ...region,
                x: Math.max(
                  0,
                  Math.min(1 - region.width, p.x - moving.offsetX),
                ),
                y: Math.max(
                  0,
                  Math.min(1 - region.height, p.y - moving.offsetY),
                ),
              };
            }),
          );
          return;
        }
        if (!start || !dragRef.current) return;
        const p = point(event);
        setDraft({
          x: Math.min(start.x, p.x),
          y: Math.min(start.y, p.y),
          width: Math.abs(p.x - start.x),
          height: Math.abs(p.y - start.y),
        });
      }}
      onPointerUp={() => {
        setMoving(null);
        dragRef.current = false;
        if (draft && draft.width > 0.01 && draft.height > 0.01) {
          onChange([...regions, draft]);
          onSelect(regions.length);
        }
        setStart(null);
        setDraft(null);
      }}
    >
      <img
        src={imageUrl}
        alt="Edit blur regions"
        className="block w-full select-none"
        draggable={false}
      />
      {shown.map((region, index) => (
        <button
          key={`${region.x}-${region.y}-${index}`}
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
            const p = point(event);
            onSelect(index);
            setMoving({
              index,
              offsetX: p.x - region.x,
              offsetY: p.y - region.y,
            });
          }}
          className={`absolute border-2 ${selectedRegion === index ? "border-red-400 bg-red-500/25" : "border-white/80 bg-white/10"}`}
          style={{
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.width * 100}%`,
            height: `${region.height * 100}%`,
          }}
          aria-label={`Select region ${index + 1}`}
        >
          <span className="absolute -left-2 -top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {index + 1}
          </span>
        </button>
      ))}
      <div className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white">
        <HiPlus className="mr-1 inline h-3 w-3" />
        Drag to add region
      </div>
    </div>
  );
}

async function buildBlurPreview(
  src: string,
  regions: Rect[],
  intensity: number,
) {
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
    ctx.filter = `blur(${intensity}px)`;
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-bold ${status === "pending" ? "bg-yellow-500/10 text-yellow-400" : status === "approved" ? "bg-green-500/10 text-green-400" : "bg-zinc-700 text-zinc-300"}`}
    >
      {status}
    </span>
  );
}
