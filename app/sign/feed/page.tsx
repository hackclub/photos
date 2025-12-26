"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import { getLatestMedia } from "@/app/actions/signage";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
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
export default function LiveFeedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentMedia, setCurrentMedia] = useState<MediaItem | null>(null);
  const { displayUrl } = useHeicUrl(currentMedia?.url || "");
  const [isStarted, setIsStarted] = useState(false);
  const lastMediaId = useRef<string | null>(null);
  useEffect(() => {
    const autoStart = searchParams.get("start") === "true";
    if (autoStart) {
      setIsStarted(true);
    }
  }, [searchParams]);
  useEffect(() => {
    if (!isStarted) return;
    const fetchLatest = async () => {
      try {
        const res = await getLatestMedia(1);
        if (res.success && res.media && res.media.length > 0) {
          const latest = res.media[0];
          if (latest.id !== lastMediaId.current) {
            lastMediaId.current = latest.id;
            setCurrentMedia(latest as MediaItem);
          }
        }
      } catch (error) {
        console.error("Error fetching latest media:", error);
      }
    };
    fetchLatest();
    const interval = setInterval(fetchLatest, 5000);
    return () => clearInterval(interval);
  }, [isStarted]);
  if (!isStarted) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="flex items-center justify-between mb-8">
            <Link
              href="/sign"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <HiArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-3xl font-bold">Live Feed</h1>
            <div className="w-6" />
          </div>

          <p className="text-zinc-400 text-lg mb-8">
            This mode will display the most recently uploaded photo. It checks
            for new photos every 5 seconds.
          </p>

          <button
            onClick={() => {
              const params = new URLSearchParams();
              params.set("start", "true");
              router.push(`/sign/feed?${params.toString()}`);
            }}
            className="w-full bg-red-600 text-white font-bold py-4 rounded-xl hover:bg-red-700 transition-colors text-xl"
          >
            Start Live Feed
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      {currentMedia ? (
        <div className="relative w-full h-full animate-fade-in key-{currentMedia.id}">
          <Image
            src={displayUrl || ""}
            alt="Live Feed"
            fill
            className="object-contain"
            unoptimized
          />

          <div className="absolute bottom-8 left-8 bg-black/50 backdrop-blur-md p-6 rounded-2xl text-white max-w-2xl animate-slide-up">
            <div className="flex items-center gap-4 mb-2">
              <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                Just Uploaded
              </span>
              <p className="text-sm text-zinc-300">
                by {currentMedia.uploadedBy.name}
              </p>
            </div>
            {currentMedia.caption && (
              <p className="text-2xl font-medium">{currentMedia.caption}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="text-white flex flex-col items-center gap-4">
          <Image
            src="/lost.png"
            alt="No photos yet"
            width={256}
            height={256}
            className="object-contain opacity-50"
            unoptimized
          />
          <div className="flex items-center gap-3">
            <LoadingSpinner size="sm" />
            <p className="text-zinc-400">Waiting for new photos...</p>
          </div>
        </div>
      )}

      <div className="absolute top-4 right-4 opacity-0 hover:opacity-100 transition-opacity duration-300">
        <button
          onClick={() => setIsStarted(false)}
          className="bg-black/50 backdrop-blur text-white px-4 py-2 rounded-full hover:bg-white/20 transition-colors text-sm font-medium"
        >
          Stop Feed
        </button>
      </div>
    </div>
  );
}
