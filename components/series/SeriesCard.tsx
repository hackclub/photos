"use client";
import Image from "next/image";
import Link from "next/link";
import {
  HiCheck,
  HiEye,
  HiEyeSlash,
  HiFolder,
  HiLockClosed,
  HiPencil,
  HiPhoto,
  HiServer,
} from "react-icons/hi2";
import { formatBytes } from "@/lib/format";

interface SeriesCardProps {
  series: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    visibility?: "public" | "unlisted" | "auth_required";
    eventCount?: number;
    totalPhotos?: number;
    totalSize?: number;
    thumbnailUrl?: string | null;
    bannerUrl?: string | null;
  };
  href?: string;
  showVisibilityBadge?: boolean;
  showStats?: boolean;
  showActions?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
  className?: string;
}
export default function SeriesCard({
  series,
  href,
  showVisibilityBadge = false,
  showStats = true,
  showActions = false,
  selectionMode = false,
  isSelected = false,
  onToggleSelection,
  className = "",
}: SeriesCardProps) {
  const linkHref = href || `/series/${series.slug}`;
  const displayImage = series.thumbnailUrl || series.bannerUrl;
  const cardImage = (
    <div className="relative aspect-video overflow-hidden bg-zinc-800">
      {displayImage ? (
        <Image
          src={displayImage}
          alt={series.name}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div className="w-full h-full bg-linear-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
          <HiFolder className="w-12 h-12 text-zinc-700 group-hover:text-zinc-600 transition-colors" />
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
            className={`w-8 h-8 rounded-full backdrop-blur-sm border-2 flex items-center justify-center transition-all hover:bg-zinc-800 ${
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
        <Link href={linkHref}>
          <h3 className="font-semibold text-white text-lg mb-2 group-hover:text-red-400 transition-colors line-clamp-1">
            {series.name}
          </h3>
        </Link>

        {series.description && (
          <p className="text-sm text-zinc-400 mb-4 line-clamp-2 min-h-[2.5em]">
            {series.description}
          </p>
        )}

        <div className="flex items-end justify-between mt-auto pt-4 border-t border-zinc-800/50">
          {showStats ? (
            <div className="flex items-center gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-lg font-bold text-white">
                  {series.eventCount ?? 0}
                </span>
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <HiFolder className="w-4 h-4" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">
                    Events
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-lg font-bold text-white">
                  {series.totalPhotos ?? 0}
                </span>
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <HiPhoto className="w-4 h-4" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">
                    Photos
                  </span>
                </div>
              </div>
              {series.totalSize !== undefined && (
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold text-white">
                    {formatBytes(series.totalSize)}
                  </span>
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <HiServer className="w-4 h-4" />
                    <span className="text-[10px] font-medium uppercase tracking-wider">
                      Size
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div />
          )}

          {showVisibilityBadge && series.visibility && (
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium mb-1">
              {series.visibility === "public" ? (
                <div
                  className="flex items-center gap-1.5 text-zinc-500"
                  title="Public"
                >
                  <HiEye className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Public</span>
                </div>
              ) : series.visibility === "unlisted" ? (
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
              href={`/admin/series/${series.id}/edit`}
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
