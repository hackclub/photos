"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HiArrowLeft,
  HiForward,
  HiPause,
  HiPlay,
  HiStop,
} from "react-icons/hi2";
import { getRandomMedia, getSeriesAndEvents } from "@/app/actions/signage";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import UserAvatar from "@/components/ui/UserAvatar";
import { useHeicUrl } from "@/hooks/useHeicUrl";

type MediaItem = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  uploadedBy: {
    name: string;
    avatarS3Key: string | null;
  };
};
type Config = {
  interval: number;
  seriesId: string;
  eventId: string;
  fitToScreen: boolean;
};
export default function RandomSignagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [config, setConfig] = useState<Config>({
    interval: 10,
    seriesId: "",
    eventId: "",
    fitToScreen: false,
  });
  useEffect(() => {
    const interval = searchParams.get("interval");
    const seriesId = searchParams.get("seriesId");
    const eventId = searchParams.get("eventId");
    const fitToScreen = searchParams.get("fitToScreen") === "true";
    const autoStart = searchParams.get("start") === "true";
    if (interval || seriesId || eventId || fitToScreen) {
      setConfig((prev) => ({
        ...prev,
        interval: interval ? parseInt(interval, 10) : prev.interval,
        seriesId: seriesId || prev.seriesId,
        eventId: eventId || prev.eventId,
        fitToScreen: fitToScreen,
      }));
    }
    if (autoStart) {
      setIsPlaying(true);
    }
  }, [searchParams]);
  const [options, setOptions] = useState<{
    series: {
      id: string;
      name: string;
    }[];
    events: {
      id: string;
      name: string;
      seriesId: string | null;
    }[];
  }>({ series: [], events: [] });
  const [currentMedia, setCurrentMedia] = useState<MediaItem | null>(null);
  const { displayUrl } = useHeicUrl(currentMedia?.url || "");
  const [nextMedia, setNextMedia] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [_error, setError] = useState("");
  const mediaQueue = useRef<MediaItem[]>([]);
  const prefetchThreshold = 3;
  useEffect(() => {
    getSeriesAndEvents().then((res) => {
      if (res.success) {
        setOptions({
          series: res.series || [],
          events: res.events || [],
        });
      }
    });
  }, []);
  const fetchMoreMedia = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await getRandomMedia(
        {
          seriesId: config.seriesId || undefined,
          eventId: config.eventId || undefined,
        },
        10,
      );
      if (res.success && res.media) {
        mediaQueue.current = [
          ...mediaQueue.current,
          ...(res.media as MediaItem[]),
        ];
        if (!currentMedia && mediaQueue.current.length > 0) {
          const next = mediaQueue.current.shift();
          if (next) setCurrentMedia(next);
        }
      } else {
        setError("Failed to load media");
      }
    } catch (e) {
      console.error(e);
      setError("Error loading media");
    } finally {
      setLoading(false);
    }
  }, [config, loading, currentMedia]);
  useEffect(() => {
    if (isPlaying && mediaQueue.current.length === 0) {
      fetchMoreMedia();
    }
  }, [isPlaying, fetchMoreMedia]);
  const advanceSlide = useCallback(() => {
    if (mediaQueue.current.length > 0) {
      const next = mediaQueue.current.shift();
      if (next) {
        setCurrentMedia(next);
        if (mediaQueue.current.length < prefetchThreshold) {
          fetchMoreMedia();
        }
      }
    } else {
      fetchMoreMedia();
    }
  }, [fetchMoreMedia]);
  useEffect(() => {
    if (!isPlaying || isPaused) return;
    const timer = setInterval(advanceSlide, config.interval * 1000);
    return () => clearInterval(timer);
  }, [isPlaying, isPaused, config.interval, advanceSlide]);
  useEffect(() => {
    if (mediaQueue.current.length > 0) {
      setNextMedia(mediaQueue.current[0]);
    }
  });
  if (isPlaying) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
        {nextMedia && (
          <div className="hidden">
            <Image src={nextMedia.url} alt="preload" width={100} height={100} />
          </div>
        )}

        {currentMedia ? (
          <div className="relative w-full h-full animate-fade-in">
            <Image
              src={displayUrl || ""}
              alt="Random"
              fill
              className={`${config.fitToScreen ? "object-cover" : "object-contain"}`}
              onError={() => {
                console.warn("Image failed to load, skipping...");
                advanceSlide();
              }}
              unoptimized
            />

            <div className="absolute bottom-8 left-8 bg-black/50 backdrop-blur-md p-4 rounded-xl text-white max-w-2xl">
              {currentMedia.caption && (
                <p className="text-xl font-medium mb-2">
                  {currentMedia.caption}
                </p>
              )}
              <div className="flex items-center gap-3">
                <UserAvatar user={currentMedia.uploadedBy} size="sm" />
                <p className="text-sm text-zinc-300">
                  Photo by {currentMedia.uploadedBy.name}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <LoadingSpinner size="xl" />
            <p className="text-zinc-400">Loading photos...</p>
          </div>
        )}

        <div
          className={`absolute top-4 right-4 transition-opacity duration-300 flex gap-2 ${isPaused ? "opacity-100" : "opacity-0 hover:opacity-100"}`}
        >
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="bg-black/50 backdrop-blur text-white p-3 rounded-full hover:bg-white/20 transition-colors"
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? (
              <HiPlay className="w-6 h-6" />
            ) : (
              <HiPause className="w-6 h-6" />
            )}
          </button>
          <button
            onClick={advanceSlide}
            className="bg-black/50 backdrop-blur text-white p-3 rounded-full hover:bg-white/20 transition-colors"
            title="Skip"
          >
            <HiForward className="w-6 h-6" />
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              setIsPaused(false);
            }}
            className="bg-black/50 backdrop-blur text-white p-3 rounded-full hover:bg-white/20 transition-colors"
            title="Stop"
          >
            <HiStop className="w-6 h-6" />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center justify-center">
      <div className="max-w-md w-full space-y-8">
        <div className="flex items-center justify-between">
          <Link
            href="/sign"
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <HiArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-3xl font-bold">Random Photos</h1>
          <div className="w-6" />
        </div>

        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Interval (seconds)
            </label>
            <input
              type="number"
              min="3"
              value={config.interval}
              onChange={(e) =>
                setConfig({
                  ...config,
                  interval: parseInt(e.target.value, 10) || 5,
                })
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Filter by Series (Optional)
            </label>
            <select
              value={config.seriesId}
              onChange={(e) =>
                setConfig({ ...config, seriesId: e.target.value, eventId: "" })
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              <option value="">All Series</option>
              {options.series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Filter by Event (Optional)
            </label>
            <select
              value={config.eventId}
              onChange={(e) =>
                setConfig({ ...config, eventId: e.target.value })
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              <option value="">All Events</option>
              {options.events
                .filter(
                  (e) => !config.seriesId || e.seriesId === config.seriesId,
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="fitToScreen"
              checked={config.fitToScreen}
              onChange={(e) =>
                setConfig({ ...config, fitToScreen: e.target.checked })
              }
              className="w-5 h-5 rounded-lg border-zinc-800 bg-zinc-950 text-red-600 focus:ring-red-600 focus:ring-offset-0"
            />
            <label
              htmlFor="fitToScreen"
              className="text-sm font-medium text-zinc-400 select-none cursor-pointer"
            >
              Fit to screen (Scale to fill)
            </label>
          </div>

          <button
            onClick={() => {
              const params = new URLSearchParams();
              params.set("interval", config.interval.toString());
              if (config.seriesId) params.set("seriesId", config.seriesId);
              if (config.eventId) params.set("eventId", config.eventId);
              if (config.fitToScreen) params.set("fitToScreen", "true");
              params.set("start", "true");
              router.push(`/sign/random?${params.toString()}`);
            }}
            className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
          >
            <HiPlay className="w-5 h-5" />
            Start Slideshow
          </button>
        </div>
      </div>
    </div>
  );
}
