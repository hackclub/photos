"use client";
import Image from "next/image";
import Link from "next/link";
import { HiChatBubbleLeft, HiHeart, HiPhoto } from "react-icons/hi2";
import VideoIndicator from "../media/VideoIndicator";
import UserAvatar from "../ui/UserAvatar";
import type { FeedItemType } from "./types";

interface FeedItemProps {
  item: FeedItemType;
  imageUrl: string | null;
  isNew: boolean;
  index: number;
  onSelect: (media: NonNullable<FeedItemType["media"]>) => void;
}
export default function FeedItem({
  item,
  imageUrl,
  isNew,
  index,
  onSelect,
}: FeedItemProps) {
  const isVideo = item.media?.mimeType.startsWith("video/");
  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(date).toLocaleDateString();
  };
  const getActionText = () => {
    switch (item.type) {
      case "photo":
        return "uploaded a photo";
      case "comment":
        return "commented on a photo";
      case "like":
        return "liked a photo";
      default:
        return "did something";
    }
  };
  return (
    <div
      className={`group/card relative flex flex-col gap-3 p-4 rounded-2xl border border-zinc-800/50 bg-zinc-900/20 transition-all hover:bg-zinc-900/40 hover:border-zinc-700/50 ${isNew ? " bg-red-600/5" : ""}`}
      style={{
        animation: isNew ? "highlight 2s ease-out" : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        <Link
          href={`/users/${item.user.handle || item.user.id}`}
          className="shrink-0"
        >
          <UserAvatar
            user={{
              name: item.user.name || item.user.email.split("@")[0],
              email: item.user.email,
              avatarS3Key: item.user.avatarS3Key,
              slackId: item.user.slackId,
            }}
            size="sm"
            className="w-8 h-8 ring-2 ring-zinc-900"
          />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-1.5 leading-snug">
            <Link
              href={`/users/${item.user.handle || item.user.id}`}
              className="font-semibold text-white hover:text-red-400 transition-colors text-sm"
            >
              {item.user.name || item.user.email.split("@")[0]}
            </Link>
            <span className="text-zinc-500 text-xs">{getActionText()}</span>
            <span className="text-zinc-600 text-xs">
              {formatTimeAgo(item.timestamp)}
            </span>
          </div>

          {item.event && (
            <div className="text-xs text-zinc-500 truncate">
              in{" "}
              <Link
                href={`/events/${item.event.slug}`}
                className="font-medium text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                {item.event.name}
              </Link>
            </div>
          )}
        </div>
      </div>

      {item.type === "comment" && item.comment && (
        <div className="text-zinc-300 text-sm leading-relaxed px-1">
          "{item.comment.content}"
        </div>
      )}

      {item.media && (
        <div className="relative rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800/50 shadow-lg w-full mt-1">
          <button
            type="button"
            onClick={() => onSelect(item.media!)}
            className="block w-full aspect-square relative group/media"
          >
            {!imageUrl ? (
              <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                <HiPhoto className="w-8 h-8 text-zinc-700" />
              </div>
            ) : (
              <>
                <Image
                  src={imageUrl}
                  alt={item.media.filename}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-700 group-hover/media:scale-105"
                  priority={index < 6}
                />
                {isVideo && <VideoIndicator size="lg" />}
              </>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover/media:opacity-100 transition-opacity duration-300">
              <div className="flex items-center gap-4 text-white">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <HiHeart className="w-5 h-5 text-red-600" />
                  <span>{item.media.likeCount || 0}</span>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <HiChatBubbleLeft className="w-5 h-5 text-zinc-400" />
                  <span>{item.media.commentCount || 0}</span>
                </div>
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
