"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { FaDice, FaUpload } from "react-icons/fa";
import { SiSlack } from "react-icons/si";
import { checkAvatarExistence } from "@/app/actions/users";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import UserAvatar from "@/components/ui/UserAvatar";
import { getDiceBearUrl, getSlackAvatarUrl } from "@/lib/avatar";
import AvatarUploader from "./AvatarUploader";

interface AvatarSelectorProps {
  email: string;
  currentAvatarUrl?: string;
  currentAvatarS3Key?: string;
  currentAvatarSource?:
    | "upload"
    | "slack"
    | "gravatar"
    | "libravatar"
    | "dicebear";
  onAvatarChange: (
    url: string,
    s3Key: string,
    source: "upload" | "slack" | "gravatar" | "libravatar" | "dicebear",
  ) => void;
  defaultToGravatar?: boolean;
  hasSlackId?: boolean;
  slackId?: string | null;
  onUpload?: (file: File) => Promise<{
    success: boolean;
    avatarS3Key?: string;
    url?: string;
    error?: string;
  }>;
}
export default function AvatarSelector({
  email,
  currentAvatarUrl,
  currentAvatarS3Key,
  currentAvatarSource = "dicebear",
  onAvatarChange,
  defaultToGravatar = false,
  hasSlackId = false,
  slackId,
  onUpload,
}: AvatarSelectorProps) {
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl || "");
  const [avatarS3Key, setAvatarS3Key] = useState(currentAvatarS3Key || "");
  const [avatarSource, setAvatarSource] = useState(currentAvatarSource);
  const [isRandomizing, setIsRandomizing] = useState(false);
  useEffect(() => {
    setAvatarUrl(currentAvatarUrl || "");
    setAvatarS3Key(currentAvatarS3Key || "");
    setAvatarSource(currentAvatarSource);
  }, [currentAvatarUrl, currentAvatarS3Key, currentAvatarSource]);
  const [foundAvatar, setFoundAvatar] = useState<{
    type: "gravatar" | "libravatar";
    url: string;
  } | null>(null);
  const [_checkingGravatar, setCheckingGravatar] = useState(false);
  const [syncingSlack, setSyncingSlack] = useState(false);
  const [mode, setMode] = useState<"preview" | "upload">("preview");
  useEffect(() => {
    if (!email) return;
    const check = async () => {
      setCheckingGravatar(true);
      try {
        const result = await checkAvatarExistence(email);
        if (result.found && result.url && result.type) {
          setFoundAvatar({ type: result.type, url: result.url });
          if (defaultToGravatar && !currentAvatarUrl && !currentAvatarS3Key) {
            setAvatarUrl(result.url);
            setAvatarS3Key("");
            setAvatarSource(result.type);
            onAvatarChange(result.url, "", result.type);
          }
        }
      } catch (error) {
        console.error("Error checking avatar:", error);
      } finally {
        setCheckingGravatar(false);
      }
    };
    check();
  }, [
    email,
    defaultToGravatar,
    currentAvatarUrl,
    currentAvatarS3Key,
    onAvatarChange,
  ]);
  const handleSyncSlack = async () => {
    if (!slackId) return;
    setSyncingSlack(true);
    try {
      const slackAvatarUrl = getSlackAvatarUrl(slackId);
      setAvatarUrl(slackAvatarUrl);
      setAvatarS3Key("");
      setAvatarSource("slack");
      onAvatarChange(slackAvatarUrl, "", "slack");
    } catch (error) {
      console.error("Error syncing Slack avatar:", error);
    } finally {
      setSyncingSlack(false);
    }
  };
  const handleUploadComplete = (key: string, url: string) => {
    setAvatarS3Key(key);
    setAvatarUrl(url);
    setAvatarSource("upload");
    onAvatarChange(url, key, "upload");
    setMode("preview");
  };
  const generateRandomAvatar = async () => {
    setIsRandomizing(true);
    const seed = Math.random().toString(36).substring(7);
    const url = getDiceBearUrl(seed);
    setAvatarUrl(url);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], "avatar.svg", { type: "image/svg+xml" });
      let result: {
        success: boolean;
        avatarS3Key?: string;
        url?: string;
        error?: string;
      };
      if (onUpload) {
        result = await onUpload(file);
      } else {
        const formData = new FormData();
        formData.append("avatar", file);
        const { uploadUserAvatar } = await import("@/app/actions/users");
        result = await uploadUserAvatar(formData);
      }
      if (result.success && result.avatarS3Key && result.url) {
        setAvatarS3Key(result.avatarS3Key);
        setAvatarSource("upload");
        onAvatarChange(result.url, result.avatarS3Key, "upload");
      } else {
        console.error("Failed to upload random avatar:", result.error);
        setAvatarS3Key("");
        setAvatarSource("dicebear");
        onAvatarChange(url, "", "dicebear");
      }
    } catch (e) {
      console.error("Failed to upload random avatar", e);
      setAvatarS3Key("");
      setAvatarSource("dicebear");
      onAvatarChange(url, "", "dicebear");
    } finally {
      setIsRandomizing(false);
    }
  };
  const useFoundAvatar = () => {
    if (foundAvatar) {
      setAvatarUrl(foundAvatar.url);
      setAvatarS3Key("");
      setAvatarSource(foundAvatar.type);
      onAvatarChange(foundAvatar.url, "", foundAvatar.type);
    }
  };
  const _useDiceBear = () => {
    const url = getDiceBearUrl(email);
    setAvatarUrl(url);
    setAvatarS3Key("");
    setAvatarSource("dicebear");
    onAvatarChange(url, "", "dicebear");
  };
  if (mode === "upload") {
    return (
      <div className="space-y-4">
        <AvatarUploader
          onUploadComplete={handleUploadComplete}
          onUpload={onUpload}
        />
        <button
          onClick={() => setMode("preview")}
          className="w-full py-2 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center space-y-6">
      <div className="w-32 h-32 rounded-full overflow-hidden bg-zinc-900 border-2 border-zinc-800 shadow-xl relative group">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt="Avatar Preview"
            fill
            sizes="128px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <UserAvatar
            user={{
              name: "User",
              avatarS3Key: avatarS3Key || null,
              slackId: slackId,
              avatarSource: avatarSource,
              email: email,
            }}
            size="2xl"
            className="w-full h-full"
          />
        )}

        <button
          onClick={() => setMode("upload")}
          className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        >
          <FaUpload className="w-8 h-8 text-white" />
        </button>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-xs">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode("upload")}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              avatarSource === "upload" && !isRandomizing
                ? "bg-zinc-800 border border-zinc-700 text-white shadow-sm"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700"
            }`}
          >
            <FaUpload className="w-4 h-4" />
            Upload
          </button>
          <button
            onClick={generateRandomAvatar}
            disabled={isRandomizing}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition-all"
          >
            {isRandomizing ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <FaDice className="w-4 h-4" />
                Randomize
              </>
            )}
          </button>
        </div>

        <div className="h-px bg-zinc-800 w-full my-1" />

        <div className="space-y-2">
          {(hasSlackId || slackId) && (
            <button
              onClick={handleSyncSlack}
              disabled={syncingSlack}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                avatarSource === "slack"
                  ? "bg-zinc-800 border border-zinc-700 text-white shadow-sm"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700"
              }`}
            >
              <span className="flex items-center gap-2">
                <SiSlack className="w-4 h-4" />
                {syncingSlack ? "Syncing..." : "Slack Profile"}
              </span>
              {avatarSource === "slack" && (
                <div className="w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>
          )}

          {foundAvatar && (
            <button
              onClick={useFoundAvatar}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                avatarSource === foundAvatar.type
                  ? "bg-zinc-800 border border-zinc-700 text-white shadow-sm"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700"
              }`}
            >
              <span className="flex items-center gap-2">
                <Image
                  src={foundAvatar.url}
                  alt="Found avatar"
                  width={16}
                  height={16}
                  className="rounded-full"
                  unoptimized
                />
                {foundAvatar.type === "gravatar" ? "Gravatar" : "Libravatar"}
              </span>
              {avatarSource === foundAvatar.type && (
                <div className="w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
