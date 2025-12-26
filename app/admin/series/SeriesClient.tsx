"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  HiCheckCircle,
  HiFolder,
  HiFunnel,
  HiPlus,
  HiTrash,
} from "react-icons/hi2";
import { deleteSeries } from "@/app/actions/series";
import SeriesCard from "@/components/series/SeriesCard";
import { AdminSearch, AdminToolbar } from "@/components/ui/AdminPageLayout";

interface Series {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: "public" | "unlisted" | "auth_required";
  eventCount: number;
  totalPhotos: number;
  totalSize: number;
  thumbnailUrl: string | null;
}
interface SeriesClientProps {
  series: Series[];
}
export default function SeriesClient({ series }: SeriesClientProps) {
  const router = useRouter();
  const [selectedSeries, setSelectedSeries] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "public" | "auth_required" | "unlisted"
  >("all");
  const filteredSeries = series.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesVisibility =
      visibilityFilter === "all" || s.visibility === visibilityFilter;
    return matchesSearch && matchesVisibility;
  });
  const toggleSeries = (seriesId: string) => {
    const newSelected = new Set(selectedSeries);
    if (newSelected.has(seriesId)) {
      newSelected.delete(seriesId);
    } else {
      newSelected.add(seriesId);
    }
    setSelectedSeries(newSelected);
  };
  const toggleAll = () => {
    if (selectedSeries.size === filteredSeries.length) {
      setSelectedSeries(new Set());
    } else {
      setSelectedSeries(new Set(filteredSeries.map((s) => s.id)));
    }
  };
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedSeries(new Set());
  };
  const handleBulkDelete = async () => {
    if (selectedSeries.size === 0) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedSeries.size} series? This will also delete all events and photos in ${selectedSeries.size > 1 ? "these series" : "this series"}.`,
    );
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      for (const seriesId of selectedSeries) {
        await deleteSeries(seriesId);
      }
      setSelectedSeries(new Set());
      router.refresh();
    } catch (error) {
      console.error("Error deleting series:", error);
      alert("Failed to delete some series. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };
  return (
    <div className="space-y-6">
      {selectionMode && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-zinc-800 rounded-lg border border-zinc-700 sticky top-4 z-30 shadow-xl">
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <button
              type="button"
              onClick={exitSelectionMode}
              className="px-3 sm:px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={toggleAll}
              className="px-3 sm:px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 rounded-lg transition"
            >
              {selectedSeries.size === filteredSeries.length &&
              filteredSeries.length > 0
                ? "Deselect All"
                : "Select All"}
            </button>
            <span className="text-sm text-zinc-400">
              {selectedSeries.size} selected
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={selectedSeries.size === 0 || isDeleting}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition flex items-center justify-center gap-2"
            >
              <HiTrash className="w-5 h-5" />
              <span className="hidden sm:inline">
                {isDeleting ? "Deleting..." : "Delete"}
              </span>
              <span className="sm:hidden">
                {isDeleting ? "Deleting..." : "Delete"}
              </span>
            </button>
          </div>
        </div>
      )}

      <AdminToolbar>
        <AdminSearch
          placeholder="Search series..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
          <HiFunnel className="text-zinc-400 shrink-0" />
          <select
            value={visibilityFilter}
            onChange={(e) =>
              setVisibilityFilter(
                e.target.value as
                  | "all"
                  | "public"
                  | "auth_required"
                  | "unlisted",
              )
            }
            className="bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-3 focus:outline-none focus:border-red-600/50 transition-colors"
          >
            <option value="all">All Visibility</option>
            <option value="public">Public</option>
            <option value="auth_required">Auth Required</option>
            <option value="unlisted">Unlisted</option>
          </select>
          {!selectionMode && (
            <button
              type="button"
              onClick={() => setSelectionMode(true)}
              className="px-3 sm:px-4 py-3 text-sm bg-zinc-900 hover:bg-zinc-800 rounded-lg transition flex items-center gap-2 border border-zinc-800 font-medium whitespace-nowrap text-zinc-300 hover:text-white"
            >
              <HiCheckCircle className="w-5 h-5" />
              <span className="hidden sm:inline">Select</span>
            </button>
          )}
        </div>
      </AdminToolbar>

      {filteredSeries.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSeries.map((s) => (
            <SeriesCard
              key={s.id}
              series={s}
              showVisibilityBadge={true}
              showStats={true}
              showActions={true}
              selectionMode={selectionMode}
              isSelected={selectedSeries.has(s.id)}
              onToggleSelection={() => toggleSeries(s.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-24 bg-zinc-900 rounded-xl border border-zinc-800">
          <HiFolder className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-3">
            {searchQuery || visibilityFilter !== "all"
              ? "No matching series found"
              : "No series yet"}
          </h3>
          <p className="text-zinc-400 mb-8 max-w-md mx-auto">
            {searchQuery || visibilityFilter !== "all"
              ? "Try adjusting your search or filters"
              : "Create your first series to organize related events together"}
          </p>
          {!(searchQuery || visibilityFilter !== "all") && (
            <Link
              href="/admin/series/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all"
            >
              <HiPlus className="text-xl" />
              Create First Series
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
