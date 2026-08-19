"use client";
import Image from "next/image";
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
  source: "manual" | "face" | "automatic_face";
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
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                  <Image
                    src={`/media/${request.media.id}/thumbnail`}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                    style={
                      request.source !== "manual" && request.regions?.[0]
                        ? {
                            objectPosition: `${(request.regions[0].x + request.regions[0].width / 2) * 100}% ${(request.regions[0].y + request.regions[0].height / 2) * 100}%`,
                            transform: "scale(2.2)",
                          }
                        : undefined
                    }
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">
                    {request.media?.filename || "Deleted media"}
                  </p>
                  <p className="truncate text-sm text-zinc-500">
                    {request.requester?.preferredName ||
                      request.requester?.handle ||
                      "User"}
                  </p>
                  {request.source !== "manual" ? (
                    <span className="mt-1 inline-block rounded-full border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                      {request.source === "face"
                        ? "Face match"
                        : "Automatic face match"}
                    </span>
                  ) : null}
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
  const [suggestedIntensity, setSuggestedIntensity] = useState(12);
  const [manuallyAdjusted, setManuallyAdjusted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUrls(null);
    setRegions(request.regions || []);
    setSelectedRegion(0);
    setBlurIntensity(12);
    setSuggestedIntensity(12);
    setManuallyAdjusted(false);
    setError(null);
    let current = true;
    void getBlurRequestUrls(request.id).then((result) => {
      if (!current) return;
      if (result.success && result.originalUrl && result.blurredUrl) {
        setUrls({
          originalUrl: result.originalUrl,
          blurredUrl: result.blurredUrl,
        });
      } else setError(result.error || "Failed to load request images");
    });
    return () => {
      current = false;
    };
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
  const updateSuggestedIntensity = (width: number, height: number) => {
    const largestRegion = regions.reduce(
      (largest, region) =>
        Math.max(region.width * width, region.height * height, largest),
      0,
    );
    const next = Math.max(8, Math.min(24, Math.round(largestRegion / 48)));
    setSuggestedIntensity(next);
    if (!manuallyAdjusted) setBlurIntensity(next);
  };
  const approve = async () => {
    if (!urls || regions.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await resolveBlurRequest(
        request.id,
        "approved",
        undefined,
        regions,
        blurIntensity,
      );
      if (!result.success)
        throw new Error(result.error || "Failed to approve request");
      onResolved("approved");
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : "Failed to approve request",
      );
    } finally {
      setBusy(false);
    }
  };
  const reject = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await resolveBlurRequest(
        request.id,
        "rejected",
        undefined,
        regions,
      );
      if (!result.success)
        throw new Error(result.error || "Failed to reject request");
      onResolved("rejected");
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : "Failed to reject request",
      );
    } finally {
      setBusy(false);
    }
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
            {request.source !== "manual" ? (
              <p className="mt-2 text-xs font-medium text-cyan-300">
                Submitted from a high-confidence face match. Verify the person
                and box before approval.
              </p>
            ) : null}
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
        {error ? (
          <p className="mt-3 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[1fr_280px]">
        <div>
          {urls ? (
            <RegionEditor
              imageUrl={urls.originalUrl}
              regions={regions}
              selectedRegion={selectedRegion}
              blurIntensity={blurIntensity}
              onSelect={setSelectedRegion}
              onChange={setRegions}
              onImageSize={updateSuggestedIntensity}
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
            <div className="flex items-center justify-between text-xs">
              <span className="text-cyan-300">
                {manuallyAdjusted
                  ? "Manual setting"
                  : "Suggested for this photo"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setBlurIntensity(suggestedIntensity);
                  setManuallyAdjusted(false);
                }}
                className="text-zinc-500 underline hover:text-white"
              >
                Use {suggestedIntensity}px
              </button>
            </div>
            <input
              type="range"
              min="4"
              max="24"
              step="2"
              value={blurIntensity}
              onChange={(event) => {
                setBlurIntensity(Number(event.target.value));
                setManuallyAdjusted(true);
              }}
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
  blurIntensity,
  onSelect,
  onChange,
  onImageSize,
}: {
  imageUrl: string;
  regions: Rect[];
  selectedRegion: number;
  blurIntensity: number;
  onSelect: (index: number) => void;
  onChange: (regions: Rect[]) => void;
  onImageSize: (width: number, height: number) => void;
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
        onLoad={(event) =>
          onImageSize(
            event.currentTarget.naturalWidth,
            event.currentTarget.naturalHeight,
          )
        }
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
          className={`absolute border-2 backdrop-blur-sm ${selectedRegion === index ? "border-red-400 bg-red-500/25" : "border-white/80 bg-white/10"}`}
          style={{
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.width * 100}%`,
            height: `${region.height * 100}%`,
            backdropFilter: `blur(${Math.max(4, blurIntensity / 2)}px)`,
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-bold ${status === "pending" ? "bg-yellow-500/10 text-yellow-400" : status === "approved" ? "bg-green-500/10 text-green-400" : "bg-zinc-700 text-zinc-300"}`}
    >
      {status}
    </span>
  );
}
