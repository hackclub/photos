"use client";
import Image from "next/image";
import Link from "next/link";
import {
  HiCalendar,
  HiCheck,
  HiEye,
  HiEyeSlash,
  HiFolder,
  HiLockClosed,
  HiMapPin,
  HiPencil,
  HiPhoto,
  HiServer,
  HiUsers,
} from "react-icons/hi2";
import { formatBytes } from "@/lib/format";

interface EventCardProps {
  event: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    eventDate?: Date | null;
    location?: string | null;
    locationCity?: string | null;
    visibility?: "public" | "unlisted" | "auth_required";
    bannerUrl?: string | null;
    thumbnailUrl?: string | null;
    firstMediaUrl?: string | null;
    mediaCount?: number;
    totalSize?: number;
    participantCount?: number;
    series?: {
      name: string;
    } | null;
  };
  href?: string;
  showVisibilityBadge?: boolean;
  showStats?: boolean;
  showDate?: boolean;
  showLocation?: boolean;
  showSeries?: boolean;
  showActions?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
  className?: string;
  showJoinDate?: boolean;
  joinedAt?: Date;
}
export default function EventCard({
  event,
  href,
  showVisibilityBadge = false,
  showStats = true,
  showDate = true,
  showLocation = false,
  showSeries = true,
  showActions = false,
  selectionMode = false,
  isSelected = false,
  onToggleSelection,
  className = "",
  showJoinDate = false,
  joinedAt,
}: EventCardProps) {
  const linkHref = href || `/events/${event.slug}`;
  const displayImage =
    event.bannerUrl || event.thumbnailUrl || event.firstMediaUrl;
  const cardImage = (
    <div className="relative aspect-video overflow-hidden bg-zinc-800">
      {displayImage ? (
        <Image
          src={displayImage}
          alt={event.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
          <HiCalendar className="w-12 h-12 text-zinc-700 group-hover:scale-110 transition-transform duration-300" />
        </div>
      )}

      {selectionMode && onToggleSelection && (
        <div className="absolute top-3 left-3 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelection();
            }}
            className={`w-8 h-8 rounded-lg backdrop-blur-sm border-2 flex items-center justify-center transition-all hover:bg-zinc-800 ${
              isSelected
                ? "bg-red-600 border-red-600"
                : "bg-zinc-900/80 border-white"
            }`}
          >
            {isSelected && <HiCheck className="w-5 h-5 text-white" />}
          </button>
        </div>
      )}
    </div>
  );
  return (
    <div
      className={`group bg-zinc-900 rounded-xl border overflow-hidden transition-all ${
        isSelected
          ? "border-red-600 "
          : "border-zinc-800 hover:border-red-600/50"
      } ${className}`}
    >
      {selectionMode && onToggleSelection ? (
        <button
          type="button"
          onClick={onToggleSelection}
          className="block w-full text-left"
        >
          {cardImage}
        </button>
      ) : (
        <Link href={linkHref} className="block">
          {cardImage}
        </Link>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <Link href={linkHref} className="flex-1">
            <h3 className="font-semibold text-white text-lg group-hover:text-red-400 transition-colors line-clamp-1">
              {event.name}
            </h3>
          </Link>
        </div>

        {showSeries && event.series && (
          <div className="mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-500/10 border border-zinc-500/20 px-2.5 py-0.5 rounded-full">
              <HiFolder className="w-3 h-3" />
              {event.series.name}
            </span>
          </div>
        )}

        {event.description && (
          <p className="text-sm text-zinc-400 line-clamp-2 mb-3 min-h-[2.5em]">
            {event.description}
          </p>
        )}

        {(showDate || showLocation || showJoinDate) && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 mb-3">
            {showJoinDate && joinedAt ? (
              <div className="flex items-center gap-1.5">
                <HiCalendar className="w-3.5 h-3.5" />
                <span>
                  Joined{" "}
                  {new Date(joinedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            ) : showDate && event.eventDate ? (
              <div className="flex items-center gap-1.5">
                <HiCalendar className="w-3.5 h-3.5" />
                <span>{new Date(event.eventDate).toLocaleDateString()}</span>
              </div>
            ) : null}

            {showLocation && (event.locationCity || event.location) && (
              <div className="flex items-center gap-1.5">
                <HiMapPin className="w-3.5 h-3.5" />
                <span className="truncate max-w-[150px]">
                  {event.locationCity || event.location}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800/50">
          {showStats ? (
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <div className="flex items-center gap-1.5">
                <HiPhoto className="w-3.5 h-3.5" />
                <span>{event.mediaCount ?? 0}</span>
              </div>
              {event.totalSize !== undefined && (
                <div className="flex items-center gap-1.5">
                  <HiServer className="w-3.5 h-3.5" />
                  <span>{formatBytes(event.totalSize)}</span>
                </div>
              )}

              {event.participantCount !== undefined && (
                <div className="flex items-center gap-1.5">
                  <HiUsers className="w-3.5 h-3.5" />
                  <span>{event.participantCount}</span>
                </div>
              )}
            </div>
          ) : (
            <div />
          )}

          {showVisibilityBadge && event.visibility && (
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium">
              {event.visibility === "public" ? (
                <div
                  className="flex items-center gap-1.5 text-zinc-500"
                  title="Public"
                >
                  <HiEye className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Public</span>
                </div>
              ) : event.visibility === "unlisted" ? (
                <div
                  className="flex items-center gap-1.5 text-zinc-500"
                  title="Unlisted"
                >
                  <HiEyeSlash className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Unlisted</span>
                </div>
              ) : (
                <div
                  className="flex items-center gap-1.5 text-zinc-500"
                  title="Auth Required"
                >
                  <HiLockClosed className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Auth Required</span>
                </div>
              )}
            </div>
          )}
        </div>

        {showActions && (
          <div className="flex items-center gap-2 mt-4">
            <Link
              href={`/admin/events/${event.id}/edit`}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-transparent border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-sm font-medium rounded-lg transition-all group/btn"
            >
              <HiPencil className="w-5 h-5 group-hover/btn:text-red-400 transition-colors" />
              Edit
            </Link>
            <Link
              href={linkHref}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-transparent border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-sm font-medium rounded-lg transition-all group/btn"
            >
              <HiEye className="w-5 h-5 group-hover/btn:text-red-400 transition-colors" />
              View
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
