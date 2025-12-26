"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  HiArrowDownTray,
  HiCalendar,
  HiCloud,
  HiExclamationTriangle,
  HiFaceSmile,
  HiGlobeAlt,
  HiHeart,
  HiInformationCircle,
  HiPencilSquare,
  HiPhoto,
  HiTrash,
  HiUserGroup,
  HiVideoCamera,
} from "react-icons/hi2";
import {
  SiBluesky,
  SiDiscord,
  SiGithub,
  SiInstagram,
  SiLinkedin,
  SiMastodon,
  SiReddit,
  SiTelegram,
  SiTiktok,
  SiTwitch,
  SiX,
} from "react-icons/si";
import { deleteAccount, updateUserProfile } from "@/app/actions/users";
import EventCard from "@/components/events/EventCard";
import AvatarSelector from "@/components/media/AvatarSelector";
import MediaGallery from "@/components/media/MediaGallery";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import UserAvatar, { clearAvatarCache } from "@/components/ui/UserAvatar";
import DeleteAccountModal from "@/components/users/DeleteAccountModal";
import EditProfileModal from "@/components/users/EditProfileModal";
import UserReports from "@/components/users/UserReports";
import { useAuth } from "@/hooks/useAuth";
import { SOCIAL_URLS } from "@/lib/constants";

interface User {
  id: string;
  name: string;
  preferredName?: string | null;
  handle?: string | null;
  email: string;
  createdAt: Date;
  isBanned?: boolean;
  bannedAt?: Date | null;
  banReason?: string | null;
  bio?: string | null;
  avatarS3Key?: string | null;
  avatarSource?: "upload" | "slack" | "gravatar" | "libravatar" | "dicebear";
  socialLinks?: Record<string, string> | null;
  slackId?: string | null;
  storageLimit?: number;
  isGlobalAdmin?: boolean;
}
interface MediaItem {
  id: string;
  filename: string;
  mimeType: string;
  s3Key: string;
  s3Url: string;
  thumbnailS3Key: string | null;
  width: number | null;
  height: number | null;
  exifData: Record<string, unknown> | null;
  uploadedAt: Date;
  uploadedBy: {
    id: string;
    name: string;
    handle?: string | null;
    avatarS3Key?: string | null;
    slackId?: string | null;
  };
  event?: {
    id: string;
    name: string;
    slug: string;
  };
  likeCount?: number;
  commentCount?: number;
  canDelete?: boolean;
}
interface Event {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  eventDate: Date | null;
  location: string | null;
  locationCity?: string | null;
  visibility?: "public" | "unlisted" | "auth_required";
  bannerS3Key: string | null;
  bannerUrl?: string | null;
  joinedAt?: Date;
  series?: {
    name: string;
  } | null;
  mediaCount?: number;
  participantCount?: number;
}
interface Props {
  user: User;
  currentUserId?: string;
  isOwnProfile: boolean;
  initialTab: string;
  isAdmin?: boolean;
}
type Tab = "uploads" | "likes" | "mentions" | "events";
export default function UserProfileClient({
  user: initialUser,
  currentUserId,
  isOwnProfile,
  initialTab,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab as Tab);
  const [uploads, setUploads] = useState<MediaItem[]>([]);
  const [likes, setLikes] = useState<MediaItem[]>([]);
  const [mentions, setMentions] = useState<MediaItem[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageUsage, setStorageUsage] = useState<number>(0);
  const { refreshUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [showReports, setShowReports] = useState(false);
  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { getUserProfileData } = await import("@/app/actions/profile");
        const result = await getUserProfileData(user.id);
        if (result.success && result.data) {
          const uploads = (result.data.uploads || []) as MediaItem[];
          setUploads(uploads);
          setLikes((result.data.likes || []) as MediaItem[]);
          setMentions((result.data.mentions || []) as MediaItem[]);
          setEvents(result.data.events || []);
          if (isOwnProfile) {
            const { getUserStorageUsage } = await import("@/app/actions/users");
            const usage = await getUserStorageUsage(user.id);
            setStorageUsage(usage);
          }
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.id, isOwnProfile]);
  const handleAvatarChange = async (
    url: string,
    key: string,
    source: "upload" | "slack" | "gravatar" | "libravatar" | "dicebear",
  ) => {
    try {
      let finalKey: string | null = key;
      const updateData: {
        avatarS3Key?: string | null;
        avatarSource:
          | "upload"
          | "slack"
          | "gravatar"
          | "libravatar"
          | "dicebear";
      } = {
        avatarSource: source,
      };
      if (source === "upload") {
        updateData.avatarS3Key = key;
      } else {
        updateData.avatarS3Key = null;
        finalKey = null;
      }
      await updateUserProfile(user.id, updateData);
      setUser((prev) => ({
        ...prev,
        avatarS3Key: finalKey,
        avatarSource: source,
      }));
      if (finalKey) {
        clearAvatarCache(finalKey);
      }
      setAvatarVersion((v) => v + 1);
      await refreshUser();
      router.refresh();
    } catch (error) {
      console.error("Failed to update avatar:", error);
    }
  };
  const handleDeleteAccount = async () => {
    try {
      const result = await deleteAccount();
      if (result.success) {
        await fetch("/api/auth/signout", { method: "POST" });
        setTimeout(() => {
          window.location.href = "/account-deleted";
        }, 100);
      } else {
        console.error("Failed to delete account:", result.error);
        alert("Failed to delete account. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      alert("An error occurred while deleting your account.");
    }
  };
  const photoCount = uploads.filter((m) =>
    m.mimeType.startsWith("image/"),
  ).length;
  const videoCount = uploads.filter((m) =>
    m.mimeType.startsWith("video/"),
  ).length;
  const storageLimit = user.storageLimit || 20 * 1024 * 1024 * 1024;
  const isUnlimited = user.storageLimit === -1 || user.isGlobalAdmin;
  const storagePercentage = isUnlimited
    ? 0
    : Math.min(100, (storageUsage / storageLimit) * 100);
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
  };
  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8">
      <div className="mb-8 sm:mb-12">
        <div className="flex flex-col md:flex-row gap-6 md:items-start">
          <div className="relative group">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 border-4 border-zinc-900 shadow-xl overflow-hidden">
              <UserAvatar
                user={user}
                size="xl"
                className="w-full! h-full! text-4xl!"
                avatarVersion={avatarVersion}
              />

              {isOwnProfile && (
                <button
                  onClick={() => setShowAvatarSelector(true)}
                  className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity z-10 w-full h-full border-none outline-none"
                >
                  <div className="text-center">
                    <HiPhoto className="w-6 h-6 text-white mx-auto mb-1" />
                    <span className="text-xs text-white font-medium">
                      Change
                    </span>
                  </div>
                </button>
              )}
            </div>
          </div>

          {showAvatarSelector && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full relative">
                <button
                  onClick={() => setShowAvatarSelector(false)}
                  className="absolute top-4 right-4 text-zinc-400 hover:text-white"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <title>Close</title>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>

                <h3 className="text-xl font-bold text-white mb-6 text-center">
                  Update Profile Picture
                </h3>

                <AvatarSelector
                  email={user.email}
                  currentAvatarS3Key={user.avatarS3Key || undefined}
                  currentAvatarSource={user.avatarSource}
                  onAvatarChange={handleAvatarChange}
                  hasSlackId={!!user.slackId}
                  slackId={user.slackId}
                />
              </div>
            </div>
          )}

          {isEditing && (
            <EditProfileModal
              user={user}
              onClose={() => setIsEditing(false)}
              onSave={async () => {
                await refreshUser();
                router.refresh();
              }}
            />
          )}

          <DeleteAccountModal
            isOpen={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            onConfirm={handleDeleteAccount}
            user={user}
            uploads={uploads}
            stats={{
              photos: photoCount,
              videos: videoCount,
              likes: likes.length,
              events: events.length,
            }}
          />

          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white truncate">
                  {user.preferredName || user.name}
                </h1>
                <div className="flex flex-col gap-1">
                  {user.handle && (
                    <p className="text-lg text-zinc-400 font-medium">
                      @{user.handle}
                    </p>
                  )}
                </div>
              </div>
              {isOwnProfile && (
                <div className="flex gap-2 self-start">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    <HiPencilSquare className="w-5 h-5" />
                    Edit Profile
                  </button>
                  <button
                    onClick={() => router.push("/settings/data-export")}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors"
                    title="Export Data"
                  >
                    <HiArrowDownTray className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setShowReports(!showReports)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      showReports
                        ? "bg-red-600 text-white"
                        : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                    }`}
                    title="My Reports"
                  >
                    <HiExclamationTriangle className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-950/30 hover:bg-red-900/50 text-red-400 rounded-lg text-sm font-medium transition-colors border border-red-900/30"
                    title="Delete Account"
                  >
                    <HiTrash className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4 max-w-2xl">
              {user.bio && (
                <p className="text-zinc-300 whitespace-pre-wrap">{user.bio}</p>
              )}

              {isOwnProfile && (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-zinc-300 font-medium">
                      <HiCloud className="w-5 h-5 text-zinc-400" />
                      Storage Usage
                      <div className="group relative ml-1">
                        <HiInformationCircle className="w-5 h-5 text-zinc-500 hover:text-zinc-300 cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-zinc-800 border border-green-500/30 rounded-lg shadow-xl text-xs text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          <p className="mb-1 font-semibold text-green-400 flex items-center gap-1">
                            <HiFaceSmile className="w-4 h-4" />
                            Storage Policy
                          </p>
                          <p>
                            The default limit is 20GB to prevent abuse. If you
                            need more space for legitimate use, just ask an
                            admin! We'd love to upgrade you! :)
                          </p>
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-zinc-800 border-r border-b border-green-500/30"></div>
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-zinc-400">
                      {formatBytes(storageUsage)} /{" "}
                      {isUnlimited ? "Unlimited" : formatBytes(storageLimit)}
                    </span>
                  </div>
                  {!isUnlimited && (
                    <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          storagePercentage > 90
                            ? "bg-red-600"
                            : storagePercentage > 75
                              ? "bg-yellow-500"
                              : "bg-blue-500"
                        }`}
                        style={{ width: `${storagePercentage}%` }}
                      />
                    </div>
                  )}
                  {!isUnlimited && storagePercentage > 90 && (
                    <p className="text-xs text-red-400 mt-2">
                      You are running low on storage. Please ask an admin for
                      more allowance. This limit exists mainly to prevent abuse
                      (like uploading a petabyte of photos), not to restrict
                      your legitimate usage.
                    </p>
                  )}
                  {!isUnlimited && storagePercentage > 100 && (
                    <p className="text-xs text-red-400 mt-2 font-bold">
                      You have exceeded your storage limit. Please ask an admin
                      for more allowance - we'll happily upgrade you! This limit
                      exists mainly to prevent abuse.
                    </p>
                  )}
                </div>
              )}

              {user.socialLinks && Object.keys(user.socialLinks).length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {user.socialLinks.website && (
                    <SocialLink
                      href={user.socialLinks.website}
                      icon={<HiGlobeAlt className="w-5 h-5" />}
                      label="Website"
                    />
                  )}
                  {user.socialLinks.github && (
                    <SocialLink
                      href={`${SOCIAL_URLS.GITHUB}${user.socialLinks.github.replace(/^@/, "")}`}
                      icon={<SiGithub className="w-5 h-5" />}
                      label={user.socialLinks.github}
                    />
                  )}
                  {user.socialLinks.twitter && (
                    <SocialLink
                      href={`${SOCIAL_URLS.X}${user.socialLinks.twitter.replace(/^@/, "")}`}
                      icon={<SiX className="w-3 h-3" />}
                      label={user.socialLinks.twitter}
                    />
                  )}
                  {user.socialLinks.instagram && (
                    <SocialLink
                      href={`${SOCIAL_URLS.INSTAGRAM}${user.socialLinks.instagram.replace(/^@/, "")}`}
                      icon={<SiInstagram className="w-5 h-5" />}
                      label={user.socialLinks.instagram}
                    />
                  )}
                  {user.socialLinks.bluesky && (
                    <SocialLink
                      href={`${SOCIAL_URLS.BLUESKY}${user.socialLinks.bluesky}`}
                      icon={<SiBluesky className="w-5 h-5" />}
                      label={user.socialLinks.bluesky}
                    />
                  )}
                  {user.socialLinks.mastodon && (
                    <SocialLink
                      href={
                        user.socialLinks.mastodon.includes("@")
                          ? `https://${user.socialLinks.mastodon.split("@")[2]}/@${user.socialLinks.mastodon.split("@")[1]}`
                          : "#"
                      }
                      icon={<SiMastodon className="w-5 h-5" />}
                      label="Mastodon"
                    />
                  )}
                  {user.socialLinks.linkedin && (
                    <SocialLink
                      href={`${SOCIAL_URLS.LINKEDIN}${user.socialLinks.linkedin}`}
                      icon={<SiLinkedin className="w-3 h-3" />}
                      label="LinkedIn"
                    />
                  )}
                  {user.socialLinks.discord && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-sm text-zinc-400 hover:text-white hover:border-zinc-700 transition-all cursor-default">
                      <SiDiscord className="w-5 h-5" />
                      <span>{user.socialLinks.discord}</span>
                    </div>
                  )}
                  {user.socialLinks.reddit && (
                    <SocialLink
                      href={`${SOCIAL_URLS.REDDIT}${user.socialLinks.reddit}`}
                      icon={<SiReddit className="w-5 h-5" />}
                      label={user.socialLinks.reddit}
                    />
                  )}
                  {user.socialLinks.telegram && (
                    <SocialLink
                      href={`${SOCIAL_URLS.TELEGRAM}${user.socialLinks.telegram}`}
                      icon={<SiTelegram className="w-5 h-5" />}
                      label={user.socialLinks.telegram}
                    />
                  )}
                  {user.socialLinks.twitch && (
                    <SocialLink
                      href={`${SOCIAL_URLS.TWITCH}${user.socialLinks.twitch}`}
                      icon={<SiTwitch className="w-3 h-3" />}
                      label={user.socialLinks.twitch}
                    />
                  )}
                  {user.socialLinks.tiktok && (
                    <SocialLink
                      href={`${SOCIAL_URLS.TIKTOK}${user.socialLinks.tiktok.replace(/^@/, "")}`}
                      icon={<SiTiktok className="w-3 h-3" />}
                      label={user.socialLinks.tiktok}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-8">
          <div className="flex flex-col gap-1">
            <span className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              {photoCount}
            </span>
            <div className="flex items-center gap-2 text-zinc-500">
              <HiPhoto className="w-5 h-5" />
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
              {likes.length}
            </span>
            <div className="flex items-center gap-2 text-zinc-500">
              <HiHeart className="w-5 h-5" />
              <span className="text-xs sm:text-sm font-medium uppercase tracking-wider">
                Likes
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              {mentions.length}
            </span>
            <div className="flex items-center gap-2 text-zinc-500">
              <HiUserGroup className="w-5 h-5" />
              <span className="text-xs sm:text-sm font-medium uppercase tracking-wider">
                Mentions
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              {events.length}
            </span>
            <div className="flex items-center gap-2 text-zinc-500">
              <HiCalendar className="w-5 h-5" />
              <span className="text-xs sm:text-sm font-medium uppercase tracking-wider">
                Events
              </span>
            </div>
          </div>
        </div>
      </div>

      {showReports && isOwnProfile ? (
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <HiExclamationTriangle className="w-6 h-6 text-red-600" />
              My Reports
            </h2>
            <button
              onClick={() => setShowReports(false)}
              className="text-sm text-zinc-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <UserReports />
        </div>
      ) : (
        <>
          <div className="flex gap-1 sm:gap-2 mb-6 sm:mb-8 border-b border-zinc-800 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab("uploads")}
              className={`px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium transition-colors flex items-center gap-1 sm:gap-2 whitespace-nowrap ${
                activeTab === "uploads"
                  ? "text-white border-b-2 border-red-600"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <HiPhoto className="w-5 h-5" />
              Uploads ({uploads.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("likes")}
              className={`px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium transition-colors flex items-center gap-1 sm:gap-2 whitespace-nowrap ${
                activeTab === "likes"
                  ? "text-white border-b-2 border-red-600"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <HiHeart className="w-5 h-5" />
              Likes ({likes.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mentions")}
              className={`px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium transition-colors flex items-center gap-1 sm:gap-2 whitespace-nowrap ${
                activeTab === "mentions"
                  ? "text-white border-b-2 border-red-600"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <HiUserGroup className="w-5 h-5" />
              Mentions ({mentions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("events")}
              className={`px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium transition-colors flex items-center gap-1 sm:gap-2 whitespace-nowrap ${
                activeTab === "events"
                  ? "text-white border-b-2 border-red-600"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <HiCalendar className="w-5 h-5" />
              Events ({events.length})
            </button>
          </div>

          {loading ? (
            <div className="text-center py-24">
              <LoadingSpinner size="xl" center />
            </div>
          ) : (
            <>
              {activeTab === "uploads" && (
                <div>
                  {uploads.length > 0 ? (
                    <MediaGallery
                      media={uploads}
                      currentUserId={currentUserId || ""}
                      showUploaderFilter={false}
                      isAdmin={isAdmin}
                    />
                  ) : (
                    <div className="text-center py-24 bg-zinc-900 rounded-xl border border-zinc-800">
                      <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-6">
                        <HiPhoto className="w-10 h-10 text-zinc-600" />
                      </div>
                      <h3 className="text-2xl font-semibold text-white mb-3">
                        No uploads yet
                      </h3>
                      <p className="text-zinc-400">
                        {isOwnProfile
                          ? "Join an event and start uploading your photos and videos!"
                          : `${user.name} hasn't uploaded any photos yet.`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "likes" && (
                <div>
                  {likes.length > 0 ? (
                    <MediaGallery
                      media={likes}
                      currentUserId={currentUserId || ""}
                      showUploaderFilter={true}
                      isAdmin={isAdmin}
                    />
                  ) : (
                    <div className="text-center py-24 bg-zinc-900 rounded-xl border border-zinc-800">
                      <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-6">
                        <HiHeart className="w-10 h-10 text-zinc-600" />
                      </div>
                      <h3 className="text-2xl font-semibold text-white mb-3">
                        No likes yet
                      </h3>
                      <p className="text-zinc-400">
                        {isOwnProfile
                          ? "Photos you like will appear here."
                          : `${user.name} hasn't liked any photos yet.`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "mentions" && (
                <div>
                  {mentions.length > 0 ? (
                    <MediaGallery
                      media={mentions}
                      currentUserId={currentUserId || ""}
                      showUploaderFilter={true}
                      isAdmin={isAdmin}
                    />
                  ) : (
                    <div className="text-center py-24 bg-zinc-900 rounded-xl border border-zinc-800">
                      <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-6">
                        <HiUserGroup className="w-10 h-10 text-zinc-600" />
                      </div>
                      <h3 className="text-2xl font-semibold text-white mb-3">
                        No mentions yet
                      </h3>
                      <p className="text-zinc-400">
                        {isOwnProfile
                          ? "Photos you are mentioned in will appear here."
                          : `${user.name} hasn't been mentioned in any photos yet.`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "events" && (
                <div>
                  {events.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {events.map((event) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          showJoinDate={true}
                          joinedAt={event.joinedAt}
                          showStats={true}
                          showSeries={true}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-24 bg-zinc-900 rounded-xl border border-zinc-800">
                      <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-6">
                        <HiCalendar className="w-10 h-10 text-zinc-600" />
                      </div>
                      <h3 className="text-2xl font-semibold text-white mb-3">
                        No events joined yet
                      </h3>
                      <p className="text-zinc-400">
                        {isOwnProfile
                          ? "Join events to start sharing photos with the community!"
                          : `${user.name} hasn't joined any events yet.`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
function SocialLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  const finalHref = href.startsWith("http") ? href : `https://${href}`;
  return (
    <a
      href={finalHref}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-sm text-zinc-400 hover:text-white hover:border-zinc-700 transition-all"
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}
