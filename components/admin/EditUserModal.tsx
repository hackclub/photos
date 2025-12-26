"use client";
import { useState } from "react";
import { HiArrowPath, HiCheck, HiGlobeAlt, HiXMark } from "react-icons/hi2";
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
import { adminUpdateUser } from "@/app/actions/admins";
import AvatarSelector from "@/components/media/AvatarSelector";

interface User {
  id: string;
  name: string;
  email: string;
  handle?: string | null;
  slackId: string | null;
  bio?: string | null;
  preferredName?: string | null;
  socialLinks?: Record<string, string> | null;
  storageLimit: number;
  avatarS3Key?: string | null;
  avatarSource?: "upload" | "slack" | "gravatar" | "libravatar" | "dicebear";
}
interface EditUserModalProps {
  user: User;
  onClose: () => void;
  onSave: (updatedUser: User) => void;
}
export default function EditUserModal({
  user,
  onClose,
  onSave,
}: EditUserModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_avatarVersion, setAvatarVersion] = useState(0);
  const [formData, setFormData] = useState({
    preferredName: user.preferredName || "",
    handle: user.handle || "",
    bio: user.bio || "",
    slackId: user.slackId || "",
    socials: {
      github: user.socialLinks?.github || "",
      twitter: user.socialLinks?.twitter || "",
      instagram: user.socialLinks?.instagram || "",
      website: user.socialLinks?.website || "",
      bluesky: user.socialLinks?.bluesky || "",
      mastodon: user.socialLinks?.mastodon || "",
      reddit: user.socialLinks?.reddit || "",
      discord: user.socialLinks?.discord || "",
      telegram: user.socialLinks?.telegram || "",
      twitch: user.socialLinks?.twitch || "",
      tiktok: user.socialLinks?.tiktok || "",
      linkedin: user.socialLinks?.linkedin || "",
    },
    storageLimit: user.storageLimit.toString(),
  });
  const [customGb, setCustomGb] = useState(() => {
    const bytes = user.storageLimit;
    if (bytes === -1) return "";
    const gb = bytes / (1024 * 1024 * 1024);
    return Number.isInteger(gb) ? gb.toString() : gb.toFixed(2);
  });
  const [storageMode, setStorageMode] = useState<"preset" | "custom">(() => {
    const val = user.storageLimit.toString();
    return ["21474836480", "107374182400", "-1"].includes(val)
      ? "preset"
      : "custom";
  });
  const handleSocialChange = (key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      socials: {
        ...prev.socials,
        [key]: value,
      },
    }));
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const socialLinks: Record<string, string> = {};
      Object.entries(formData.socials).forEach(([key, value]) => {
        if (value.trim()) {
          socialLinks[key] = value.trim();
        }
      });
      const updateData = {
        preferredName: formData.preferredName.trim() || undefined,
        handle: formData.handle.trim() || undefined,
        bio: formData.bio.trim() || undefined,
        slackId: formData.slackId.trim() || undefined,
        socialLinks,
        storageLimit: parseInt(formData.storageLimit, 10),
      };
      const result = await adminUpdateUser(user.id, updateData);
      if (result.success) {
        onSave({
          ...user,
          ...updateData,
          preferredName: updateData.preferredName || null,
          handle: updateData.handle || null,
          bio: updateData.bio || null,
          slackId: updateData.slackId || null,
          socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
          storageLimit: updateData.storageLimit,
        });
        onClose();
      } else {
        setError(result.error || "Failed to update user");
      }
    } catch (err) {
      console.error("Error updating user:", err);
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl relative flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 shrink-0">
          <h2 className="text-xl font-bold text-white">Edit User</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <HiXMark className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          <form
            id="edit-user-form"
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            {error && (
              <div className="bg-red-600/10 border border-red-600/20 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                Avatar
              </h3>
              <AvatarSelector
                email={user.email}
                currentAvatarS3Key={user.avatarS3Key || undefined}
                currentAvatarSource={user.avatarSource}
                onAvatarChange={async (url, s3Key, source) => {
                  const { adminUpdateUser } = await import(
                    "@/app/actions/admins"
                  );
                  if (source === "upload") {
                  } else {
                    await adminUpdateUser(user.id, {
                      avatarS3Key: null,
                      avatarSource: source,
                    });
                  }
                  onSave({
                    ...user,
                    avatarS3Key: source === "upload" ? s3Key : null,
                    avatarSource: source,
                  });
                  setAvatarVersion((v) => v + 1);
                }}
                hasSlackId={!!user.slackId}
                slackId={user.slackId}
                onUpload={async (file) => {
                  const formData = new FormData();
                  formData.append("avatar", file);
                  const { adminUploadUserAvatar } = await import(
                    "@/app/actions/admins"
                  );
                  return await adminUploadUserAvatar(user.id, formData);
                }}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                Basic Info
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Storage Limit
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={
                        storageMode === "custom"
                          ? "custom"
                          : formData.storageLimit
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "custom") {
                          setStorageMode("custom");
                          if (formData.storageLimit === "-1") {
                            setFormData({
                              ...formData,
                              storageLimit: "21474836480",
                            });
                            setCustomGb("20");
                          } else {
                            const currentBytes = parseInt(
                              formData.storageLimit,
                              10,
                            );
                            const gb = currentBytes / (1024 * 1024 * 1024);
                            setCustomGb(
                              Number.isInteger(gb)
                                ? gb.toString()
                                : gb.toFixed(2),
                            );
                          }
                        } else {
                          setStorageMode("preset");
                          setFormData({
                            ...formData,
                            storageLimit: val,
                          });
                        }
                      }}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none  focus:border-red-600 transition-all"
                    >
                      <option value="21474836480">Default (20GB)</option>
                      <option value="107374182400">100GB</option>
                      <option value="-1">Unlimited</option>
                      <option value="custom">Custom</option>
                    </select>
                    {storageMode === "custom" && (
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          value={customGb}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomGb(val);
                            const gb = parseFloat(val);
                            if (!Number.isNaN(gb) && gb > 0) {
                              setFormData({
                                ...formData,
                                storageLimit: Math.floor(
                                  gb * 1024 * 1024 * 1024,
                                ).toString(),
                              });
                            }
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-3 pr-8 py-2 text-white focus:outline-none  focus:border-red-600 transition-all"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
                          GB
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Preferred Name
                  </label>
                  <input
                    type="text"
                    value={formData.preferredName}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        preferredName: e.target.value,
                      })
                    }
                    placeholder={user.name}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white placeholder-zinc-600 focus:outline-none  focus:border-red-600 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Handle
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                      @
                    </span>
                    <input
                      type="text"
                      value={formData.handle}
                      onChange={(e) =>
                        setFormData({ ...formData, handle: e.target.value })
                      }
                      placeholder="username"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-white placeholder-zinc-600 focus:outline-none  focus:border-red-600 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Slack ID
                  </label>
                  <input
                    type="text"
                    value={formData.slackId}
                    onChange={(e) =>
                      setFormData({ ...formData, slackId: e.target.value })
                    }
                    placeholder="U12345678"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white placeholder-zinc-600 focus:outline-none  focus:border-red-600 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Bio
                </label>
                <textarea
                  value={formData.bio}
                  onChange={(e) =>
                    setFormData({ ...formData, bio: e.target.value })
                  }
                  placeholder="User bio..."
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white placeholder-zinc-600 focus:outline-none  focus:border-red-600 transition-all resize-none"
                />
              </div>

              <div className="pt-4 border-t border-zinc-800">
                <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">
                  Social Links
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <SocialInput
                    icon={<HiGlobeAlt className="w-5 h-5" />}
                    label="Website"
                    value={formData.socials.website}
                    onChange={(v) => handleSocialChange("website", v)}
                    placeholder="https://example.com"
                  />
                  <SocialInput
                    icon={<SiGithub className="w-5 h-5" />}
                    label="GitHub"
                    value={formData.socials.github}
                    onChange={(v) => handleSocialChange("github", v)}
                    placeholder="username"
                  />
                  <SocialInput
                    icon={<SiX className="w-5 h-5" />}
                    label="X (Twitter)"
                    value={formData.socials.twitter}
                    onChange={(v) => handleSocialChange("twitter", v)}
                    placeholder="username"
                  />
                  <SocialInput
                    icon={<SiInstagram className="w-5 h-5" />}
                    label="Instagram"
                    value={formData.socials.instagram}
                    onChange={(v) => handleSocialChange("instagram", v)}
                    placeholder="username"
                  />
                  <SocialInput
                    icon={<SiBluesky className="w-5 h-5" />}
                    label="Bluesky"
                    value={formData.socials.bluesky}
                    onChange={(v) => handleSocialChange("bluesky", v)}
                    placeholder="username.bsky.social"
                  />
                  <SocialInput
                    icon={<SiMastodon className="w-5 h-5" />}
                    label="Mastodon"
                    value={formData.socials.mastodon}
                    onChange={(v) => handleSocialChange("mastodon", v)}
                    placeholder="@user@instance.social"
                  />
                  <SocialInput
                    icon={<SiLinkedin className="w-5 h-5" />}
                    label="LinkedIn"
                    value={formData.socials.linkedin}
                    onChange={(v) => handleSocialChange("linkedin", v)}
                    placeholder="username"
                  />
                  <SocialInput
                    icon={<SiDiscord className="w-5 h-5" />}
                    label="Discord"
                    value={formData.socials.discord}
                    onChange={(v) => handleSocialChange("discord", v)}
                    placeholder="username"
                  />
                  <SocialInput
                    icon={<SiReddit className="w-5 h-5" />}
                    label="Reddit"
                    value={formData.socials.reddit}
                    onChange={(v) => handleSocialChange("reddit", v)}
                    placeholder="username"
                  />
                  <SocialInput
                    icon={<SiTelegram className="w-5 h-5" />}
                    label="Telegram"
                    value={formData.socials.telegram}
                    onChange={(v) => handleSocialChange("telegram", v)}
                    placeholder="username"
                  />
                  <SocialInput
                    icon={<SiTwitch className="w-5 h-5" />}
                    label="Twitch"
                    value={formData.socials.twitch}
                    onChange={(v) => handleSocialChange("twitch", v)}
                    placeholder="username"
                  />
                  <SocialInput
                    icon={<SiTiktok className="w-5 h-5" />}
                    label="TikTok"
                    value={formData.socials.tiktok}
                    onChange={(v) => handleSocialChange("tiktok", v)}
                    placeholder="@username"
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-zinc-800 shrink-0 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-user-form"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {saving ? (
              <HiArrowPath className="w-5 h-5 animate-spin" />
            ) : (
              <HiCheck className="w-5 h-5" />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
function SocialInput({
  icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-500 uppercase mb-1">
        {label}
      </label>
      <div className="relative group">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-zinc-300 transition-colors">
          {icon}
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-3 py-2 text-white placeholder-zinc-700 focus:outline-none  focus:border-red-600 transition-all"
        />
      </div>
    </div>
  );
}
