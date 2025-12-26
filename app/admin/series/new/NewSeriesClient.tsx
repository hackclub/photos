"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HiCheck, HiEye, HiRectangleStack, HiXMark } from "react-icons/hi2";
import { createSeries } from "@/app/actions/series";
import FormInput from "@/components/ui/FormInput";
import FormTextarea from "@/components/ui/FormTextarea";
export default function NewSeriesClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    visibility: "auth_required" as "public" | "auth_required" | "unlisted",
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
      const result = await createSeries(formData);
      if (result.success && result.series) {
        router.push(`/series/${result.series.slug}`);
      } else {
        throw new Error(result.error || "Failed to create series");
      }
    } catch (error: unknown) {
      console.error("Error creating series:", error);
      const message =
        error instanceof Error ? error.message : "Failed to create series";
      alert(message);
    } finally {
      setLoading(false);
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
    if (name === "name") {
      const newSlug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      setFormData((prev) => ({
        ...prev,
        slug: newSlug,
      }));
      if (newSlug && /^[a-z0-9-]+$/.test(newSlug)) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors.slug;
          return newErrors;
        });
      }
    }
  };
  return (
    <div className="min-h-screen bg-black">
      <div className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                Create Series
              </h1>
              <p className="text-zinc-400">
                Organize related events into a series collection
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
                helperText="Auto-generated from series name, or customize it"
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

          <div className="flex items-center justify-end gap-3">
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
              {loading ? "Creating..." : "Create Series"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
