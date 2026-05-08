"use client";
import Image from "next/image";
import { useState } from "react";
import { HiUser } from "react-icons/hi2";
import { getInitials } from "@/lib/avatar";
import { getSlackAvatarUrl } from "@/lib/user-display";

interface UserAvatarProps {
  user: {
    name: string;
    slackId?: string | null;
    avatarUrl?: string | null;
  };
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  url?: string | null;
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
export function clearAvatarCache(_key: string) {}
export default function UserAvatar({
  user,
  size = "md",
  className = "",
  url,
}: UserAvatarProps) {
  const [error, setError] = useState(false);
  const avatarUrl = url ?? user.avatarUrl ?? getSlackAvatarUrl(user.slackId);
  const initials = getInitials(user.name);
  return (
    <div
      className={`relative rounded-full overflow-hidden flex items-center justify-center shrink-0 ${sizeClasses[size]} ${className} ${!avatarUrl || error ? "bg-zinc-800 border border-zinc-700" : "bg-zinc-900"}`}
    >
      {avatarUrl && !error ? (
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
        <span className="font-medium text-zinc-400 select-none">
          {initials || <HiUser className={iconSizes[size]} />}
        </span>
      )}
    </div>
  );
}
