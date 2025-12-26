"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  HiCalendar,
  HiCheck,
  HiEye,
  HiMapPin,
  HiRectangleStack,
  HiUsers,
  HiXMark,
} from "react-icons/hi2";
import { createEvent } from "@/app/actions/events";
import LocationSearch from "@/components/map/LocationSearch";
import FormInput from "@/components/ui/FormInput";
import FormTextarea from "@/components/ui/FormTextarea";

interface NewEventClientProps {
  allowedSeries: {
    id: string;
    name: string;
  }[];
}
export default function NewEventClient({ allowedSeries }: NewEventClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    seriesId: "",
    visibility: "auth_required" as "public" | "auth_required" | "unlisted",
    requiresInvite: false,
    eventDate: "",
    location: "",
    locationCity: "",
    locationCountry: "",
    latitude: "",
    longitude: "",
  });
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = "Event name is required";
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
      const result = await createEvent(formData);
      if (result.success && result.event) {
        router.push(`/events/${result.event.slug}`);
      } else {
        throw new Error(result.error || "Failed to create event");
      }
    } catch (error: unknown) {
      console.error("Error creating event:", error);
      const message =
        error instanceof Error ? error.message : "Failed to create event";
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
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
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
                Create Event
              </h1>
              <p className="text-zinc-400">
                Set up a new photo collection for a Hack Club event
              </p>
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
                error={errors.name}
              />

              {allowedSeries.length > 0 && (
                <div>
                  <label
                    htmlFor="seriesId"
                    className="block text-sm font-medium text-zinc-300 mb-2"
                  >
                    Series (Optional)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <HiRectangleStack className="h-5 w-5 text-zinc-500" />
                    </div>
                    <select
                      id="seriesId"
                      name="seriesId"
                      value={formData.seriesId}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-3 bg-black border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all appearance-none"
                    >
                      <option value="">No Series</option>
                      {allowedSeries.map((series) => (
                        <option key={series.id} value={series.id}>
                          {series.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-zinc-500"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1.5">
                    Group this event under a series
                  </p>
                </div>
              )}

              <div>
                <label
                  htmlFor="slug"
                  className="block text-sm font-medium text-zinc-300 mb-2"
                >
                  URL Slug <span className="text-red-600">*</span>
                </label>
                <div className="flex items-center">
                  <span
                    className={`px-4 py-3 bg-zinc-800 border border-r-0 rounded-l-lg text-zinc-400 text-sm ${errors.slug ? "border-red-600" : "border-zinc-700"}`}
                  >
                    /events/
                  </span>
                  <input
                    type="text"
                    id="slug"
                    name="slug"
                    required
                    value={formData.slug}
                    onChange={handleChange}
                    className={`flex-1 px-4 py-3 bg-black border rounded-r-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all ${errors.slug ? "border-red-600" : "border-zinc-700"}`}
                    placeholder="assemble-2024"
                  />
                </div>
                {errors.slug && (
                  <p className="text-sm text-red-600 mt-1 animate-in slide-in-from-top-1 duration-200">
                    {errors.slug}
                  </p>
                )}
                <p className="text-xs text-zinc-500 mt-1.5">
                  Auto-generated from event name, or customize it
                </p>
              </div>

              <FormTextarea
                label="Description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                placeholder="Describe what this event is about..."
              />
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
            </div>
          </div>

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
              {loading ? "Creating..." : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
