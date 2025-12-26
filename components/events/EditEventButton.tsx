"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HiCheck, HiPencil, HiXMark } from "react-icons/hi2";
import { updateEvent } from "@/app/actions/events";

interface EditEventButtonProps {
  event: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    bannerUrl: string | null;
    visibility: string;
    requiresInvite: boolean;
    eventDate: Date | null;
    seriesId: string | null;
  };
  availableSeries: Array<{
    id: string;
    name: string;
  }>;
}
export default function EditEventButton({
  event,
  availableSeries,
}: EditEventButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: event.name,
    description: event.description || "",
    bannerUrl: event.bannerUrl || "",
    visibility: event.visibility,
    requiresInvite: event.requiresInvite,
    eventDate: event.eventDate
      ? new Date(event.eventDate).toISOString().split("T")[0]
      : "",
    seriesId: event.seriesId || "",
  });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const result = await updateEvent(event.id, {
        ...formData,
        visibility: formData.visibility as
          | "public"
          | "auth_required"
          | "unlisted",
        slug: event.slug,
        seriesId: formData.seriesId || undefined,
        eventDate: formData.eventDate || undefined,
      });
      if (result.success) {
        router.refresh();
        setIsOpen(false);
      } else {
        alert(result.error || "Failed to update event");
      }
    } catch (error) {
      console.error("Update error:", error);
      alert("Failed to update event");
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg transition-all"
      >
        <HiPencil className="w-5 h-5" />
        <span>Edit Event</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !isSaving && setIsOpen(false)}
          />

          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl">
            <form onSubmit={handleSubmit}>
              <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900">
                <div>
                  <h2 className="text-2xl font-bold text-white">Edit Event</h2>
                  <p className="text-zinc-400 mt-1">Update event details</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isSaving}
                  className="w-10 h-10 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <HiXMark className="w-6 h-6 text-zinc-400" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Event Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={4}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent resize-none"
                    placeholder="Describe this event..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Event Date
                  </label>
                  <input
                    type="date"
                    value={formData.eventDate}
                    onChange={(e) =>
                      setFormData({ ...formData, eventDate: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Banner Image URL
                  </label>
                  <input
                    type="url"
                    value={formData.bannerUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, bannerUrl: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                    placeholder="https://example.com/banner.jpg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Series (Optional)
                  </label>
                  <select
                    value={formData.seriesId}
                    onChange={(e) =>
                      setFormData({ ...formData, seriesId: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                  >
                    <option value="">No Series</option>
                    {availableSeries.map((series) => (
                      <option key={series.id} value={series.id}>
                        {series.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Visibility
                  </label>
                  <select
                    value={formData.visibility}
                    onChange={(e) =>
                      setFormData({ ...formData, visibility: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                  >
                    <option value="public">Public - Anyone can view</option>
                    <option value="auth_required">
                      Auth Required - Only logged in users
                    </option>
                    <option value="unlisted">
                      Unlisted - Only via direct link
                    </option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="requiresInvite"
                    checked={formData.requiresInvite}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        requiresInvite: e.target.checked,
                      })
                    }
                    className="w-5 h-5 bg-zinc-800 border border-zinc-700 rounded-md text-red-600 focus:ring-2 focus:ring-red-600"
                  />
                  <label
                    htmlFor="requiresInvite"
                    className="text-sm text-zinc-300"
                  >
                    Require invite code to join
                  </label>
                </div>
              </div>

              <div className="sticky bottom-0 flex items-center justify-end gap-4 p-6 border-t border-zinc-800 bg-zinc-900">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isSaving}
                  className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
                >
                  <HiCheck className="w-5 h-5" />
                  <span>{isSaving ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
