import { FaDice } from "react-icons/fa";
import {
  HiArrowDown,
  HiArrowUp,
  HiCalendar,
  HiCheckCircle,
  HiClock,
  HiHeart,
  HiPhoto,
  HiPlay,
  HiUser,
} from "react-icons/hi2";

interface MediaGalleryToolbarProps {
  filter: "all" | "photos" | "videos";
  setFilter: (filter: "all" | "photos" | "videos") => void;
  sortBy: "date" | "uploader" | "event" | "likes" | "random";
  setSortBy: (
    sortBy: "date" | "uploader" | "event" | "likes" | "random",
  ) => void;
  dateOrder: "desc" | "asc";
  setDateOrder: (order: "desc" | "asc") => void;
  setRandomSeed: (seed: number) => void;
  selectionMode: boolean;
  setSelectionMode: (mode: boolean) => void;
  showUploaderFilter: boolean;
  showEventFilter: boolean;
  showTypeFilter: boolean;
  showSortFilter: boolean;
}
export default function MediaGalleryToolbar({
  filter,
  setFilter,
  sortBy,
  setSortBy,
  dateOrder,
  setDateOrder,
  setRandomSeed,
  selectionMode,
  setSelectionMode,
  showUploaderFilter,
  showEventFilter,
  showTypeFilter,
  showSortFilter,
}: MediaGalleryToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2 sm:gap-3 items-center justify-between flex-wrap">
        {showTypeFilter ? (
          <div className="flex gap-1 sm:gap-2 flex-1 sm:flex-none">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-full font-medium transition-all ${
                filter === "all"
                  ? "bg-red-600 text-white shadow-lg "
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter("photos")}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-full font-medium transition-all flex items-center justify-center gap-1 sm:gap-2 ${
                filter === "photos"
                  ? "bg-red-600 text-white shadow-lg "
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <HiPhoto className="w-5 h-5" />
              <span className="hidden sm:inline">Photos</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter("videos")}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-full font-medium transition-all flex items-center justify-center gap-1 sm:gap-2 ${
                filter === "videos"
                  ? "bg-red-600 text-white shadow-lg "
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <HiPlay className="w-5 h-5" />
              <span className="hidden sm:inline">Videos</span>
            </button>
          </div>
        ) : (
          <div />
        )}

        {!selectionMode && (
          <button
            type="button"
            onClick={() => setSelectionMode(true)}
            className="px-3 sm:px-4 py-2 sm:py-2.5 text-sm bg-zinc-900 hover:bg-zinc-800 rounded-full transition flex items-center gap-2 border border-zinc-800 hover:border-zinc-700 font-medium"
          >
            <HiCheckCircle className="w-5 h-5" />
            <span className="hidden sm:inline">Select</span>
          </button>
        )}
      </div>

      <div className="flex gap-2 sm:gap-3 items-center flex-wrap">
        {showSortFilter && (
          <div className="flex gap-1 sm:gap-2 flex-wrap w-full sm:w-auto">
            <div className="flex gap-0">
              <button
                type="button"
                onClick={() => setSortBy("date")}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-l-full font-medium transition-all flex items-center gap-1 sm:gap-2 ${
                  sortBy === "date"
                    ? "bg-red-600 text-white shadow-lg "
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <HiClock className="w-5 h-5" />
                <span className="hidden sm:inline">Date</span>
              </button>
              {sortBy === "date" && (
                <button
                  type="button"
                  onClick={() =>
                    setDateOrder(dateOrder === "desc" ? "asc" : "desc")
                  }
                  className="px-2 sm:px-3 py-2 sm:py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-r-full transition-all shadow-lg border-l border-red-700"
                  title={dateOrder === "desc" ? "Newest first" : "Oldest first"}
                >
                  {dateOrder === "desc" ? (
                    <HiArrowDown className="w-5 h-5" />
                  ) : (
                    <HiArrowUp className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>
            {showUploaderFilter && (
              <button
                type="button"
                onClick={() => setSortBy("uploader")}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-full font-medium transition-all flex items-center gap-1 sm:gap-2 ${
                  sortBy === "uploader"
                    ? "bg-red-600 text-white shadow-lg "
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <HiUser className="w-5 h-5" />
                <span className="hidden sm:inline">Uploader</span>
              </button>
            )}
            {showEventFilter && (
              <button
                type="button"
                onClick={() => setSortBy("event")}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-full font-medium transition-all flex items-center gap-1 sm:gap-2 ${
                  sortBy === "event"
                    ? "bg-red-600 text-white shadow-lg "
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <HiCalendar className="w-5 h-5" />
                <span className="hidden sm:inline">Event</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSortBy("likes")}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-full font-medium transition-all flex items-center gap-1 sm:gap-2 ${
                sortBy === "likes"
                  ? "bg-red-600 text-white shadow-lg "
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <HiHeart className="w-5 h-5" />
              <span className="hidden sm:inline">Likes</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSortBy("random");
                setRandomSeed(Math.random());
              }}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-full font-medium transition-all flex items-center gap-1 sm:gap-2 ${
                sortBy === "random"
                  ? "bg-red-600 text-white shadow-lg "
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <FaDice className="w-5 h-5" />
              <span className="hidden sm:inline">Random</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
