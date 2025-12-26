"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { HiUser } from "react-icons/hi2";
import { getAvatarUrl } from "@/app/actions/users";
import {
  getDiceBearUrl,
  getGravatarUrl,
  getInitials,
  getLibravatarUrl,
  getSlackAvatarUrl,
} from "@/lib/avatar";

interface UserAvatarProps {
  user: {
    name: string;
    email?: string;
    avatarS3Key?: string | null;
    slackId?: string | null;
    avatarSource?: "upload" | "slack" | "gravatar" | "libravatar" | "dicebear";
  };
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  url?: string;
  avatarVersion?: number;
}
const sizeClasses = {
  xs: "w-4 h-4 text-[8px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-24 h-24 text-2xl",
  "2xl": "w-32 h-32 text-4xl",
};
const iconSizes = {
  xs: "w-2 h-2",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-10 h-10",
  "2xl": "w-12 h-12",
};
const avatarCache = new Map<string, string>();
export function clearAvatarCache(key: string) {
  avatarCache.delete(key);
}
export default function UserAvatar({
  user,
  size = "md",
  className = "",
  url: initialUrl,
  avatarVersion,
}: UserAvatarProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialUrl || null);
  const [isS3, setIsS3] = useState(false);
  const [loading, setLoading] = useState(!initialUrl);
  const [error, setError] = useState(false);
  useEffect(() => {
    void avatarVersion;
    let mounted = true;
    const resolveAvatar = async () => {
      if (initialUrl) {
        if (mounted) {
          setAvatarUrl(initialUrl);
          setIsS3(false);
          setLoading(false);
          setError(false);
        }
        return;
      }
      let source = user.avatarSource;
      if (!source) {
        if (user.avatarS3Key) {
          source = "upload";
        } else {
          source = "dicebear";
        }
      }
      switch (source) {
        case "upload":
          if (user.avatarS3Key) {
            if (avatarCache.has(user.avatarS3Key)) {
              if (mounted) {
                setAvatarUrl(avatarCache.get(user.avatarS3Key)!);
                setIsS3(true);
                setLoading(false);
                setError(false);
              }
              return;
            }
            try {
              setLoading(true);
              const result = await getAvatarUrl(user.avatarS3Key);
              if (mounted) {
                if (result.success && result.url) {
                  avatarCache.set(user.avatarS3Key, result.url);
                  setAvatarUrl(result.url);
                  setIsS3(true);
                  setError(false);
                } else {
                  setAvatarUrl(getDiceBearUrl(user.name));
                  setIsS3(false);
                  setError(false);
                }
                setLoading(false);
              }
            } catch (e) {
              console.error("Error fetching S3 avatar:", e);
              if (mounted) {
                setAvatarUrl(getDiceBearUrl(user.name));
                setIsS3(false);
                setLoading(false);
                setError(false);
              }
            }
          } else {
            if (mounted) {
              setAvatarUrl(getDiceBearUrl(user.name));
              setIsS3(false);
              setLoading(false);
              setError(false);
            }
          }
          break;
        case "slack":
          if (user.slackId) {
            if (mounted) {
              setAvatarUrl(getSlackAvatarUrl(user.slackId));
              setIsS3(false);
              setLoading(false);
              setError(false);
            }
          } else {
            if (mounted) {
              setAvatarUrl(getDiceBearUrl(user.name));
              setIsS3(false);
              setLoading(false);
              setError(false);
            }
          }
          break;
        case "gravatar":
          if (user.email) {
            if (mounted) {
              setAvatarUrl(getGravatarUrl(user.email));
              setIsS3(false);
              setLoading(false);
              setError(false);
            }
          } else {
            if (mounted) {
              setAvatarUrl(getDiceBearUrl(user.name));
              setIsS3(false);
              setLoading(false);
              setError(false);
            }
          }
          break;
        case "libravatar":
          if (user.email) {
            if (mounted) {
              setAvatarUrl(getLibravatarUrl(user.email));
              setIsS3(false);
              setLoading(false);
              setError(false);
            }
          } else {
            if (mounted) {
              setAvatarUrl(getDiceBearUrl(user.name));
              setIsS3(false);
              setLoading(false);
              setError(false);
            }
          }
          break;
        default:
          if (mounted) {
            setAvatarUrl(getDiceBearUrl(user.name));
            setIsS3(false);
            setLoading(false);
            setError(false);
          }
          break;
      }
    };
    resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [
    initialUrl,
    user.slackId,
    user.avatarS3Key,
    user.email,
    user.name,
    user.avatarSource,
    avatarVersion,
  ]);
  const initials = getInitials(user.name);
  return (
    <div
      className={`relative rounded-full overflow-hidden flex items-center justify-center shrink-0 ${sizeClasses[size]} ${className} ${!avatarUrl ? "bg-zinc-800 border border-zinc-700" : "bg-zinc-900"}`}
    >
      {loading ? (
        <div className="animate-pulse bg-zinc-700 w-full h-full" />
      ) : avatarUrl && !error ? (
        isS3 ? (
          <Image
            src={avatarUrl}
            alt={user.name}
            fill
            sizes="(max-width: 640px) 32px, 48px"
            className="object-cover"
            onError={() => setError(true)}
            unoptimized
          />
        ) : (
          <Image
            src={avatarUrl}
            alt={user.name}
            fill
            className="object-cover"
            onError={() => setError(true)}
            unoptimized
          />
        )
      ) : (
        <span className="font-medium text-zinc-400 select-none">
          {initials || <HiUser className={iconSizes[size]} />}
        </span>
      )}
    </div>
  );
}
