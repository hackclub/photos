"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import {
  HiArrowDownTray,
  HiArrowPath,
  HiCalendar,
  HiCheck,
  HiClipboardDocument,
  HiDevicePhoneMobile,
  HiEye,
  HiMapPin,
  HiPhoto,
  HiShieldCheck,
  HiTrash,
  HiUsers,
  HiXMark,
} from "react-icons/hi2";
import {
  addEventAdmin,
  getEventAdmins,
  removeEventAdmin,
} from "@/app/actions/admins";
import {
  getEvent,
  regenerateInviteCode,
  updateEvent,
} from "@/app/actions/events";
import LocationSearch from "@/components/map/LocationSearch";
import BannerUpload from "@/components/media/BannerUpload";
import ConfirmModal from "@/components/ui/ConfirmModal";
import FormInput from "@/components/ui/FormInput";
import FormTextarea from "@/components/ui/FormTextarea";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import UserSearch from "@/components/ui/UserSearch";
import type { eventAdmins, events, series, users } from "@/lib/db/schema";

interface EditEventClientProps {
  event: typeof events.$inferSelect;
  series: (typeof series.$inferSelect)[];
  initialAdmins: (typeof eventAdmins.$inferSelect & {
    user: Pick<typeof users.$inferSelect, "id" | "name" | "email">;
  })[];
  isGlobalAdmin: boolean;
  isSeriesAdmin: boolean;
}
export default function EditEventClient({
  event,
  series,
  initialAdmins,
  isGlobalAdmin,
  isSeriesAdmin,
}: EditEventClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [eventSlug] = useState(event.slug);
  const [inviteCode, setInviteCode] = useState(event.inviteCode || "");
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [regeneratingInvite, setRegeneratingInvite] = useState(false);
  const [admins, setAdmins] =
    useState<
      (typeof eventAdmins.$inferSelect & {
        user: Pick<typeof users.$inferSelect, "id" | "name" | "email">;
      })[]
    >(initialAdmins);
  const [loadingAdmins, _setLoadingAdmins] = useState(false);
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [bannerS3Key, setBannerS3Key] = useState<string | null>(
    event.bannerS3Key || null,
  );
  const [showRemoveAdminModal, setShowRemoveAdminModal] = useState(false);
  const [adminToRemove, setAdminToRemove] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: event.name || "",
    slug: event.slug || "",
    description: event.description || "",
    seriesId: event.seriesId || "",
    visibility: event.visibility || "auth_required",
    requiresInvite: event.requiresInvite || false,
    eventDate: event.eventDate
      ? new Date(event.eventDate).toISOString().split("T")[0]
      : "",
    location: event.location || "",
    locationCity: event.locationCity || "",
    locationCountry: event.locationCountry || "",
    latitude: event.latitude?.toString() || "",
    longitude: event.longitude?.toString() || "",
  });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await updateEvent(event.id, formData);
      if (result.success && result.event) {
        router.push(`/events/${result.event.slug}`);
      } else {
        throw new Error(result.error || "Failed to update event");
      }
    } catch (error: unknown) {
      console.error("Error updating event:", error);
      const message =
        error instanceof Error ? error.message : "Failed to update event";
      alert(message);
    } finally {
      setLoading(false);
    }
  };
  const refetchEventData = async () => {
    try {
      const eventResult = await getEvent(event.id);
      if (eventResult.success && eventResult.event) {
        setBannerS3Key(eventResult.event.bannerS3Key || null);
      }
    } catch (error) {
      console.error("Error refetching event:", error);
    }
  };
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };
  const handleAddAdmin = async (user: {
    id: string;
    name: string;
    email: string;
    hackclubId: string;
  }) => {
    setAddingAdmin(true);
    try {
      const result = await addEventAdmin(event.id, user.hackclubId);
      if (!result.success) {
        throw new Error(result.error || "Failed to add admin");
      }
      const adminsResult = await getEventAdmins(event.id);
      if (adminsResult.success && adminsResult.admins) {
        setAdmins(adminsResult.admins);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      alert(message);
    } finally {
      setAddingAdmin(false);
    }
  };
  const handleRemoveAdminConfirm = async () => {
    if (!adminToRemove) return;
    try {
      const result = await removeEventAdmin(event.id, adminToRemove);
      if (!result.success)
        throw new Error(result.error || "Failed to remove admin");
      setAdmins(admins.filter((a) => a.userId !== adminToRemove));
    } catch (error) {
      console.error("Error removing admin:", error);
      alert("Failed to remove admin");
    } finally {
      setAdminToRemove(null);
    }
  };
  const generateInviteLink = () => {
    if (!inviteCode) return "";
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/events/${eventSlug}?invite=${inviteCode}`;
  };
  const copyInviteLink = async () => {
    const link = generateInviteLink();
    try {
      await navigator.clipboard.writeText(link);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch (_error) {
      alert("Failed to copy invite link");
    }
  };
  const handleRegenerateInviteCode = async () => {
    setRegeneratingInvite(true);
    try {
      const result = await regenerateInviteCode(event.id);
      if (!result.success || !result.inviteCode) {
        throw new Error(result.error || "Failed to regenerate invite code");
      }
      setInviteCode(result.inviteCode);
    } catch (error) {
      console.error("Error regenerating invite code:", error);
      alert("Failed to regenerate invite code");
    } finally {
      setRegeneratingInvite(false);
    }
  };
  const downloadQRCode = () => {
    const svg = document.getElementById("event-qr-code");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    const logo = new Image();
    logo.crossOrigin = "anonymous";
    logo.src = "/hackclub-icon.png";
    logo.onload = () => {
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        const logoSize = img.width * 0.25;
        const logoX = (img.width - logoSize) / 2;
        const logoY = (img.height - logoSize) / 2;
        ctx?.drawImage(logo, logoX, logoY, logoSize, logoSize);
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `${eventSlug}-qrcode.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      };
      img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
    };
  };
  return (
    <div className="bg-black">
      <div className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Edit Event</h1>
              <p className="text-zinc-400">Update event details and settings</p>
            </div>
            <Link
              href="/admin/events"
              className="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <HiXMark className="w-5 h-5" />
              <span className="hidden sm:inline">Cancel</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white">
                Basic Details
              </h2>
            </div>
            <div className="p-6 space-y-5">
              <FormInput
                label="Event Name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Assemble 2024"
                required
              />

              <div>
                <label
                  htmlFor="slug"
                  className="block text-sm font-medium text-zinc-300 mb-2"
                >
                  URL Slug <span className="text-red-600">*</span>
                </label>
                <div className="flex items-center">
                  <span className="px-4 py-3 bg-zinc-800 border border-zinc-700 border-r-0 rounded-l-lg text-zinc-400 text-sm">
                    /events/
                  </span>
                  <input
                    type="text"
                    id="slug"
                    name="slug"
                    required
                    value={formData.slug}
                    onChange={handleChange}
                    className="flex-1 px-4 py-3 bg-black border border-zinc-700 rounded-r-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
                    placeholder="assemble-2024"
                  />
                </div>
              </div>

              <FormTextarea
                label="Description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                placeholder="Describe what this event is about..."
              />

              <div>
                <label
                  htmlFor="seriesId"
                  className="block text-sm font-medium text-zinc-300 mb-2"
                >
                  Series <span className="text-zinc-500">(optional)</span>
                </label>
                <select
                  id="seriesId"
                  name="seriesId"
                  value={formData.seriesId}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-black border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
                >
                  <option value="">No series (standalone event)</option>
                  {series.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <HiMapPin className="w-5 h-5" />
                Date & Location
              </h2>
            </div>
            <div className="p-6 space-y-5">
              <FormInput
                label="Event Date"
                name="eventDate"
                type="date"
                value={formData.eventDate}
                onChange={handleChange}
                icon={<HiCalendar className="w-5 h-5" />}
              />

              <div>
                <label
                  htmlFor="location-search"
                  className="block text-sm font-medium text-zinc-300 mb-2"
                >
                  Search Location
                </label>
                <LocationSearch
                  onLocationSelect={(location) => {
                    setFormData((prev) => ({
                      ...prev,
                      location: location.displayName,
                      locationCity: location.city,
                      locationCountry: location.country,
                      latitude: location.latitude.toString(),
                      longitude: location.longitude.toString(),
                    }));
                  }}
                  placeholder="Search for event location..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput
                  label="City"
                  name="locationCity"
                  value={formData.locationCity}
                  onChange={handleChange}
                  placeholder="e.g., San Francisco"
                />
                <FormInput
                  label="Country"
                  name="locationCountry"
                  value={formData.locationCountry}
                  onChange={handleChange}
                  placeholder="e.g., United States"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput
                  label="Latitude"
                  name="latitude"
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={handleChange}
                  placeholder="e.g., 37.7749"
                />
                <FormInput
                  label="Longitude"
                  name="longitude"
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={handleChange}
                  placeholder="e.g., -122.4194"
                />
              </div>

              <FormInput
                label="Location Description"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="e.g., Main Conference Hall, Building A"
                helperText="(optional)"
              />
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <HiEye className="w-5 h-5" />
                Privacy & Access
              </h2>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label
                  htmlFor="visibility"
                  className="block text-sm font-medium text-zinc-300 mb-2"
                >
                  Who can view this event?
                </label>
                <select
                  id="visibility"
                  name="visibility"
                  value={formData.visibility}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-black border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
                >
                  <option value="public">Public - Anyone can view</option>
                  <option value="auth_required">
                    Auth Required - Only logged-in users
                  </option>
                  <option value="unlisted">
                    Unlisted - Only with direct link
                  </option>
                </select>
              </div>

              <div className="p-4 bg-black border border-zinc-700 rounded-lg">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    name="requiresInvite"
                    checked={formData.requiresInvite}
                    onChange={handleChange}
                    className="mt-1 w-5 h-5 text-red-600 bg-zinc-800 border-zinc-600 rounded-md focus:ring-2 focus:ring-red-600"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-white group-hover:text-red-400 transition-colors">
                      <HiUsers className="w-5 h-5" />
                      Require Invite to Join
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Only users with an invite link can upload photos to this
                      event
                    </p>
                  </div>
                </label>
              </div>

              {formData.requiresInvite && inviteCode && (
                <div className="p-4 bg-black border border-zinc-700 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-zinc-300">
                      Invite Link
                    </span>
                    <button
                      type="button"
                      onClick={handleRegenerateInviteCode}
                      disabled={regeneratingInvite}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50"
                      title="Generate new invite code"
                    >
                      <HiArrowPath
                        className={`w-5 h-5 ${regeneratingInvite ? "animate-spin" : ""}`}
                      />
                      Regenerate
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generateInviteLink()}
                      className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-300 text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      {copiedInvite ? (
                        <>
                          <HiCheck className="w-5 h-5" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <HiClipboardDocument className="w-5 h-5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    Share this link to invite people to this event
                  </p>
                </div>
              )}

              {formData.requiresInvite && !inviteCode && (
                <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <p className="text-sm text-yellow-400">
                    Save the event to generate an invite link
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <HiDevicePhoneMobile className="w-5 h-5" />
                Attendee QR Code
              </h2>
            </div>
            <div className="p-6">
              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="flex flex-col gap-4">
                  <div className="bg-white p-4 rounded-xl max-w-[232px]">
                    <QRCodeSVG
                      id="event-qr-code"
                      value={
                        typeof window !== "undefined"
                          ? `${window.location.origin}/events/${eventSlug}${
                              formData.requiresInvite && inviteCode
                                ? `?invite=${inviteCode}`
                                : ""
                            }`
                          : ""
                      }
                      size={200}
                      level="H"
                      includeMargin
                      className="w-full h-auto"
                      imageSettings={{
                        src: "/hackclub-icon.png",
                        height: 50,
                        width: 50,
                        excavate: true,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={downloadQRCode}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    <HiArrowDownTray className="w-5 h-5" />
                    Download PNG
                  </button>
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <h3 className="text-white font-medium mb-1">
                      Event Join Code
                    </h3>
                    <p className="text-zinc-400 text-sm">
                      Scan this code with the Hack Club Photos app to instantly
                      join this event and enter camera mode.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
                      Encoded Link
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-black border border-zinc-700 rounded-lg text-zinc-300 text-xs font-mono break-all">
                        {typeof window !== "undefined"
                          ? `${window.location.origin}/events/${eventSlug}${
                              formData.requiresInvite && inviteCode
                                ? `?invite=${inviteCode}`
                                : ""
                            }`
                          : ""}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          const url =
                            typeof window !== "undefined"
                              ? `${window.location.origin}/events/${eventSlug}${
                                  formData.requiresInvite && inviteCode
                                    ? `?invite=${inviteCode}`
                                    : ""
                                }`
                              : "";
                          navigator.clipboard.writeText(url);
                          setCopiedInvite(true);
                          setTimeout(() => setCopiedInvite(false), 2000);
                        }}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Copy Link"
                      >
                        {copiedInvite ? <HiCheck /> : <HiClipboardDocument />}
                      </button>
                    </div>
                  </div>

                  {!formData.requiresInvite && (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <p className="text-xs text-blue-400">
                        This event is public, so the QR code just links to the
                        event page. Enabling "Require Invite" will secure this
                        code.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <HiPhoto className="w-5 h-5" />
                Banner Image
              </h2>
            </div>
            <div className="p-6">
              <BannerUpload
                type="event"
                id={event.id}
                currentBannerS3Key={bannerS3Key}
                onUploadSuccess={(s3Key) => {
                  setBannerS3Key(s3Key);
                  refetchEventData();
                }}
                onDeleteSuccess={() => {
                  setBannerS3Key(null);
                  refetchEventData();
                }}
              />
            </div>
          </div>

          {(isGlobalAdmin || isSeriesAdmin) && (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
              <div className="px-6 py-5 border-b border-zinc-800">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <HiShieldCheck className="w-5 h-5" />
                  Event Admins
                </h2>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <UserSearch
                    onSelectUser={handleAddAdmin}
                    excludeUserIds={admins.map((a) => a.userId)}
                    placeholder="Search users to add as admin..."
                    isLoading={addingAdmin}
                  />
                </div>

                {loadingAdmins ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner center />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {admins.length === 0 ? (
                      <p className="text-zinc-500 text-sm py-4 text-center">
                        No admins assigned yet
                      </p>
                    ) : (
                      admins.map((admin) => (
                        <div
                          key={admin.id}
                          className="flex items-center justify-between p-4 bg-black border border-zinc-700 rounded-lg hover:border-zinc-700 transition-colors"
                        >
                          <div>
                            <p className="text-white font-medium">
                              {admin.user.name}
                            </p>
                            <p className="text-zinc-400 text-sm">
                              {admin.user.email}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setAdminToRemove(admin.userId);
                              setShowRemoveAdminModal(true);
                            }}
                            className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
                            title="Remove admin"
                          >
                            <HiTrash className="w-5 h-5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <p className="text-xs text-zinc-500">
                  Event admins can manage settings and content. Global admins
                  have full access.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <Link
              href="/admin/events"
              className="px-6 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors font-medium"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-8 py-3 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all shadow-lg "
            >
              <HiCheck className="w-5 h-5" />
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      <ConfirmModal
        isOpen={showRemoveAdminModal}
        onClose={() => {
          setShowRemoveAdminModal(false);
          setAdminToRemove(null);
        }}
        onConfirm={handleRemoveAdminConfirm}
        title="Remove Admin"
        message="Are you sure you want to remove this admin? They will lose access to manage this event."
        confirmText="Remove Admin"
        cancelText="Cancel"
        danger={true}
        timerSeconds={3}
      />
    </div>
  );
}
