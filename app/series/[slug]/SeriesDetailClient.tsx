"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  HiArrowLeft,
  HiLockClosed,
  HiOutlineCalendar,
  HiOutlinePhoto,
  HiPencil,
  HiSquares2X2,
  HiVideoCamera,
} from "react-icons/hi2";
import EventCard from "@/components/events/EventCard";
import MediaGallery from "@/components/media/MediaGallery";

interface Event {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  eventDate: Date | null;
}
interface MediaItem {
  id: string;
  s3Url: string;
  s3Key: string;
  thumbnailS3Key: string | null;
  filename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  exifData: Record<string, unknown> | null;
  uploadedAt: Date;
  eventId: string;
  uploadedBy: {
    id: string;
    name: string;
    email?: string;
    avatarS3Key?: string | null;
    handle?: string | null;
    slackId?: string | null;
  };
}
interface SeriesData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: "public" | "auth_required" | "unlisted";
  events: Event[];
}
interface Props {
  series: SeriesData;
  allMedia: MediaItem[];
  photoCount: number;
  videoCount: number;
  bannerUrl: string | null;
  eventBannerUrls: Record<string, string>;
  eventMediaUrls: Record<string, string>;
  canEdit: boolean;
  currentUserId?: string;
  isAdmin?: boolean;
}
export default function SeriesDetailClient({
  series,
  allMedia,
  photoCount,
  videoCount,
  bannerUrl,
  eventBannerUrls,
  eventMediaUrls,
  canEdit,
  currentUserId,
  isAdmin,
}: Props) {
  const [activeTab, setActiveTab] = useState<"gallery" | "events">("events");
  return (
    <div className="min-h-screen">
      <div className="relative">
        {bannerUrl ? (
          <div className="w-full h-100 relative">
            <Image
              src={bannerUrl}
              alt={series.name}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-transparent" />
          </div>
        ) : (
          <div className="w-full h-100 bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900" />
        )}

        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="px-8 pb-8">
            <Link
              href="/series"
              className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-6 transition-colors"
            >
              <HiArrowLeft className="w-5 h-5" />
              <span>Back to Series</span>
            </Link>

            <h1 className="text-5xl font-bold text-white mb-4 max-w-4xl">
              {series.name}
            </h1>

            {series.description && (
              <p className="text-xl text-zinc-300 mb-6 max-w-3xl">
                {series.description}
              </p>
            )}

            {canEdit && (
              <div className="mb-6">
                <Link
                  href={`/admin/series/${series.id}/edit`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-all border border-zinc-700"
                >
                  <HiPencil className="w-5 h-5" />
                  <span>Edit Series</span>
                </Link>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2 text-zinc-300">
                <HiOutlineCalendar className="w-5 h-5" />
                <span className="font-medium">
                  {series.events.length}{" "}
                  {series.events.length === 1 ? "event" : "events"}
                </span>
              </div>

              {series.visibility === "unlisted" && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/50 backdrop-blur-sm border border-zinc-700 rounded-lg text-zinc-400">
                  <HiLockClosed className="w-5 h-5" />
                  <span className="text-sm">Unlisted</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-800 bg-zinc-900">
        <div className="px-8 py-6">
          <div className="flex items-center gap-8">
            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                {photoCount}
              </span>
              <div className="flex items-center gap-2 text-zinc-500">
                <HiOutlinePhoto className="w-5 h-5" />
                <span className="text-xs sm:text-sm font-medium uppercase tracking-wider">
                  Photos
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                {videoCount}
              </span>
              <div className="flex items-center gap-2 text-zinc-500">
                <HiVideoCamera className="w-5 h-5" />
                <span className="text-xs sm:text-sm font-medium uppercase tracking-wider">
                  Videos
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                {series.events.length}
              </span>
              <div className="flex items-center gap-2 text-zinc-500">
                <HiOutlineCalendar className="w-5 h-5" />
                <span className="text-xs sm:text-sm font-medium uppercase tracking-wider">
                  Events
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-800 bg-zinc-900">
        <div className="px-8">
          <div className="flex gap-6">
            <button
              type="button"
              onClick={() => setActiveTab("events")}
              className={`px-4 py-4 font-medium transition-colors relative ${
                activeTab === "events"
                  ? "text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <HiOutlineCalendar className="w-5 h-5" />
                <span>Events</span>
                <span className="text-sm text-zinc-500">
                  ({series.events.length})
                </span>
              </div>
              {activeTab === "events" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("gallery")}
              className={`px-4 py-4 font-medium transition-colors relative ${
                activeTab === "gallery"
                  ? "text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <HiSquares2X2 className="w-5 h-5" />
                <span>Gallery</span>
                <span className="text-sm text-zinc-500">
                  ({allMedia.length})
                </span>
              </div>
              {activeTab === "gallery" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-12">
        {activeTab === "events" ? (
          series.events.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {series.events.map((event) => (
                <EventCard
                  key={event.id}
                  event={{
                    ...event,
                    bannerUrl: eventBannerUrls[event.id] || null,
                    firstMediaUrl: eventMediaUrls[event.id] || null,
                    mediaCount: allMedia.filter((m) => m.eventId === event.id)
                      .length,
                  }}
                  showJoinDate={false}
                  showStats={true}
                  showSeries={false}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-24 bg-zinc-900 rounded-xl border border-zinc-800">
              <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-6">
                <HiOutlineCalendar className="w-10 h-10 text-zinc-600" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-3">
                No events yet
              </h3>
              <p className="text-zinc-400 max-w-md mx-auto">
                Events haven't been added to this series yet.
              </p>
            </div>
          )
        ) : allMedia.length > 0 ? (
          <MediaGallery
            media={allMedia}
            events={series.events}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            showEventFilter={true}
          />
        ) : (
          <div className="text-center py-24 bg-zinc-900 rounded-xl border border-zinc-800">
            <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-6">
              <HiOutlinePhoto className="w-10 h-10 text-zinc-600" />
            </div>
            <h3 className="text-2xl font-semibold text-white mb-3">
              No photos yet
            </h3>
            <p className="text-zinc-400 max-w-md mx-auto">
              Photos haven't been uploaded to any events in this series yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
