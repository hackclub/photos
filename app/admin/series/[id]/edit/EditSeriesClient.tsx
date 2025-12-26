"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  HiCheck,
  HiEye,
  HiPhoto,
  HiRectangleStack,
  HiShieldCheck,
  HiTrash,
  HiXMark,
} from "react-icons/hi2";
import {
  addSeriesAdmin,
  getSeriesAdmins,
  removeSeriesAdmin,
} from "@/app/actions/admins";
import { getSeries, updateSeries } from "@/app/actions/series";
import BannerUpload from "@/components/media/BannerUpload";
import ConfirmModal from "@/components/ui/ConfirmModal";
import FormInput from "@/components/ui/FormInput";
import FormTextarea from "@/components/ui/FormTextarea";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import UserSearch from "@/components/ui/UserSearch";
import type { series, seriesAdmins, users } from "@/lib/db/schema";

interface EditSeriesClientProps {
  series: typeof series.$inferSelect;
  initialAdmins: (typeof seriesAdmins.$inferSelect & {
    user: Pick<typeof users.$inferSelect, "id" | "name" | "email">;
  })[];
  isGlobalAdmin: boolean;
}
export default function EditSeriesClient({
  series,
  initialAdmins,
  isGlobalAdmin,
}: EditSeriesClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [admins, setAdmins] =
    useState<
      (typeof seriesAdmins.$inferSelect & {
        user: Pick<typeof users.$inferSelect, "id" | "name" | "email">;
      })[]
    >(initialAdmins);
  const [loadingAdmins, _setLoadingAdmins] = useState(false);
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [bannerS3Key, setBannerS3Key] = useState<string | null>(
    series.bannerS3Key || null,
  );
  const [showRemoveAdminModal, setShowRemoveAdminModal] = useState(false);
  const [adminToRemove, setAdminToRemove] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: series.name || "",
    slug: series.slug || "",
    description: series.description || "",
    visibility: series.visibility || "auth_required",
  });
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = "Series name is required";
    }
    if (!formData.slug.trim()) {
      newErrors.slug = "URL slug is required";
    } else if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      newErrors.slug =
        "Slug can only contain lowercase letters, numbers, and hyphens";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      return;
    }
    setLoading(true);
    try {
      const result = await updateSeries(series.id, formData);
      if (result.success && result.series) {
        router.push(`/series/${result.series.slug}`);
      } else {
        throw new Error(result.error || "Failed to update series");
      }
    } catch (error: unknown) {
      console.error("Error updating series:", error);
      const message =
        error instanceof Error ? error.message : "Failed to update series";
      alert(message);
    } finally {
      setLoading(false);
    }
  };
  const refetchSeriesData = async () => {
    try {
      const result = await getSeries(series.id);
      if (result.success && result.series) {
        setBannerS3Key(result.series.bannerS3Key || null);
      }
    } catch (error) {
      console.error("Error refetching series:", error);
    }
  };
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };
  const handleAddAdmin = async (user: {
    id: string;
    name: string;
    email: string;
    hackclubId: string;
  }) => {
    setAddingAdmin(true);
    try {
      const result = await addSeriesAdmin(series.id, user.hackclubId);
      if (!result.success) {
        throw new Error(result.error || "Failed to add admin");
      }
      const adminsResult = await getSeriesAdmins(series.id);
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
      const result = await removeSeriesAdmin(series.id, adminToRemove);
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
  return (
    <div className="min-h-screen bg-black">
      <div className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                Edit Series
              </h1>
              <p className="text-zinc-400">
                Update series details and settings
              </p>
            </div>
            <Link
              href="/admin/series"
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
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <HiRectangleStack className="w-5 h-5" />
                Basic Details
              </h2>
            </div>
            <div className="p-6 space-y-5">
              <FormInput
                label="Series Name"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="e.g., Daydream 2025"
                error={errors.name}
              />

              <FormInput
                label="URL Slug"
                id="slug"
                name="slug"
                value={formData.slug}
                onChange={handleChange}
                required
                placeholder="daydream-2025"
                prefix="/series/"
                error={errors.slug}
              />

              <FormTextarea
                label="Description"
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                placeholder="Describe what this series is about..."
              />
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <HiEye className="w-5 h-5" />
                Privacy Settings
              </h2>
            </div>
            <div className="p-6">
              <div>
                <label
                  htmlFor="visibility"
                  className="block text-sm font-medium text-zinc-300 mb-2"
                >
                  Who can view this series?
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
                type="series"
                id={series.id}
                currentBannerS3Key={bannerS3Key}
                onUploadSuccess={(s3Key) => {
                  setBannerS3Key(s3Key);
                  refetchSeriesData();
                }}
                onDeleteSuccess={() => {
                  setBannerS3Key(null);
                  refetchSeriesData();
                }}
              />
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <HiShieldCheck className="w-5 h-5" />
                Series Admins
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
                Series admins can manage all events within this series. Global
                admins have full access.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Link
              href={`/admin/series/${series.id}/bulk-create`}
              className="px-6 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors font-medium border border-zinc-700 hover:border-zinc-600"
            >
              Bulk Create Events
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/admin/series"
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
        message="Are you sure you want to remove this admin? They will lose access to manage this series."
        confirmText="Remove Admin"
        cancelText="Cancel"
        danger={true}
        timerSeconds={3}
      />
    </div>
  );
}
