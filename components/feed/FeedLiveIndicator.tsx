"use client";
import { HiSignal, HiSignalSlash } from "react-icons/hi2";

interface FeedLiveIndicatorProps {
  isLive: boolean;
  reconnectAttempts: number;
}
export default function FeedLiveIndicator({
  isLive,
  reconnectAttempts,
}: FeedLiveIndicatorProps) {
  return (
    <div className="group relative flex items-center justify-center">
      <div
        className={`p-2 rounded-full transition-colors ${
          isLive
            ? "text-green-500 bg-green-500/10"
            : "text-zinc-500 bg-zinc-500/10"
        }`}
      >
        {isLive ? (
          <HiSignal className="w-5 h-5" />
        ) : (
          <HiSignalSlash className="w-5 h-5" />
        )}
      </div>

      <div className="absolute right-full mr-2 px-2 py-1 bg-zinc-800 text-zinc-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
        {isLive ? "Realtime" : "Disconnected"}
      </div>
    </div>
  );
}
