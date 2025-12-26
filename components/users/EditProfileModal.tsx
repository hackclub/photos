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
import { useDebouncedCallback } from "use-debounce";
import { checkHandleAvailability } from "@/app/actions/onboarding";
import { updateUserProfile } from "@/app/actions/users";

interface EditProfileModalProps {
  user: {
    id: string;
    name: string;
    preferredName?: string | null;
    handle?: string | null;
    bio?: string | null;
    socialLinks?: Record<string, string> | null;
  };
  onClose: () => void;
  onSave: () => void;
}
export default function EditProfileModal({
  user,
  onClose,
  onSave,
}: EditProfileModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [checkingHandle, setCheckingHandle] = useState(false);
  const [formData, setFormData] = useState({
    preferredName: user.preferredName || "",
    handle: user.handle || "",
    bio: user.bio || "",
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
  });
  const checkHandle = useDebouncedCallback(async (handle: string) => {
    if (!handle || handle === user.handle) {
      setHandleError(null);
      setCheckingHandle(false);
      return;
    }
    setCheckingHandle(true);
    const result = await checkHandleAvailability(handle);
    setCheckingHandle(false);
    if (!result.available) {
      setHandleError(result.error || "Handle is unavailable");
    } else {
      setHandleError(null);
    }
  }, 500);
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
    if (handleError || checkingHandle) return;
    setSaving(true);
    setError(null);
    try {
      if (formData.handle !== user.handle) {
        const result = await checkHandleAvailability(formData.handle);
        if (!result.available) {
          setHandleError(result.error || "Handle is unavailable");
          setSaving(false);
          return;
        }
      }
      const socialLinks: Record<string, string> = {};
      Object.entries(formData.socials).forEach(([key, value]) => {
        if (value.trim()) {
          socialLinks[key] = value.trim();
        }
      });
      const result = await updateUserProfile(user.id, {
        preferredName: formData.preferredName.trim() || undefined,
        handle: formData.handle.trim() || undefined,
        bio: formData.bio.trim() || undefined,
        socialLinks,
      });
      if (result.success) {
        onSave();
        onClose();
      } else {
        setError(result.error || "Failed to update profile");
      }
    } catch (err) {
      console.error("Error updating profile:", err);
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl relative flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 shrink-0">
          <h2 className="text-xl font-bold text-white">Edit Profile</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <HiXMark className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          <form
            id="edit-profile-form"
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
                Basic Info
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Overrides your Hack Club directory name.
                  </p>
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
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, handle: val });
                        checkHandle(val);
                      }}
                      placeholder="username"
                      className={`w-full bg-zinc-950 border rounded-lg pl-7 pr-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                        handleError
                          ? "border-red-600 focus:ring-red-600"
                          : "border-zinc-800 focus:ring-red-600"
                      }`}
                    />
                    {checkingHandle && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <HiArrowPath className="w-5 h-5 animate-spin text-zinc-500" />
                      </div>
                    )}
                  </div>
                  {handleError ? (
                    <p className="mt-1 text-xs text-red-600">{handleError}</p>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">
                      Unique identifier for your profile URL.
                    </p>
                  )}
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
                  placeholder="Tell us about yourself..."
                  rows={3}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all resize-none"
                  maxLength={500}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                Social Links
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SocialInput
                  icon={<HiGlobeAlt />}
                  label="Website"
                  value={formData.socials.website}
                  onChange={(v) => handleSocialChange("website", v)}
                  placeholder="https://example.com"
                />
                <SocialInput
                  icon={<SiGithub />}
                  label="GitHub"
                  value={formData.socials.github}
                  onChange={(v) => handleSocialChange("github", v)}
                  placeholder="username"
                />
                <SocialInput
                  icon={<SiX />}
                  label="X (Twitter)"
                  value={formData.socials.twitter}
                  onChange={(v) => handleSocialChange("twitter", v)}
                  placeholder="username"
                />
                <SocialInput
                  icon={<SiInstagram />}
                  label="Instagram"
                  value={formData.socials.instagram}
                  onChange={(v) => handleSocialChange("instagram", v)}
                  placeholder="username"
                />
                <SocialInput
                  icon={<SiBluesky />}
                  label="Bluesky"
                  value={formData.socials.bluesky}
                  onChange={(v) => handleSocialChange("bluesky", v)}
                  placeholder="username.bsky.social"
                />
                <SocialInput
                  icon={<SiMastodon />}
                  label="Mastodon"
                  value={formData.socials.mastodon}
                  onChange={(v) => handleSocialChange("mastodon", v)}
                  placeholder="@user@instance.social"
                />
                <SocialInput
                  icon={<SiLinkedin />}
                  label="LinkedIn"
                  value={formData.socials.linkedin}
                  onChange={(v) => handleSocialChange("linkedin", v)}
                  placeholder="username"
                />
                <SocialInput
                  icon={<SiDiscord />}
                  label="Discord"
                  value={formData.socials.discord}
                  onChange={(v) => handleSocialChange("discord", v)}
                  placeholder="username"
                />
                <SocialInput
                  icon={<SiReddit />}
                  label="Reddit"
                  value={formData.socials.reddit}
                  onChange={(v) => handleSocialChange("reddit", v)}
                  placeholder="username"
                />
                <SocialInput
                  icon={<SiTelegram />}
                  label="Telegram"
                  value={formData.socials.telegram}
                  onChange={(v) => handleSocialChange("telegram", v)}
                  placeholder="username"
                />
                <SocialInput
                  icon={<SiTwitch />}
                  label="Twitch"
                  value={formData.socials.twitch}
                  onChange={(v) => handleSocialChange("twitch", v)}
                  placeholder="username"
                />
                <SocialInput
                  icon={<SiTiktok />}
                  label="TikTok"
                  value={formData.socials.tiktok}
                  onChange={(v) => handleSocialChange("tiktok", v)}
                  placeholder="@username"
                />
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
            form="edit-profile-form"
            disabled={saving || !!handleError || checkingHandle}
            className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-3 py-2 text-white placeholder-zinc-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
        />
      </div>
    </div>
  );
}
