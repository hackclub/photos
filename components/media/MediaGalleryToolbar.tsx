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
    <div className="space-y-3 overflow-x-clip">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        {showTypeFilter ? (
          <div className="scrollbar-hide -mx-1 flex flex-1 gap-1 overflow-x-auto px-1 sm:mx-0 sm:flex-none sm:gap-2 sm:overflow-visible sm:px-0">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`min-h-11 flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all sm:flex-none ${
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
              className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all sm:flex-none sm:gap-2 ${
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
              className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all sm:flex-none sm:gap-2 ${
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
            className="flex min-h-11 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium transition hover:border-zinc-700 hover:bg-zinc-800"
          >
            <HiCheckCircle className="w-5 h-5" />
            <span className="hidden sm:inline">Select</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {showSortFilter && (
          <div className="scrollbar-hide -mx-1 flex w-full gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0">
            <div className="flex shrink-0 gap-0">
              <button
                type="button"
                onClick={() => setSortBy("date")}
                className={`flex min-h-11 items-center gap-1 rounded-l-full px-4 py-2 text-sm font-medium transition-all sm:gap-2 ${
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
                  className="min-h-11 rounded-r-full border-l border-red-700 bg-red-600 px-3 py-2 text-white shadow-lg transition-all hover:bg-red-700"
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
                className={`flex min-h-11 shrink-0 items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all sm:gap-2 ${
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
                className={`flex min-h-11 shrink-0 items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all sm:gap-2 ${
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
              className={`flex min-h-11 shrink-0 items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all sm:gap-2 ${
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
              className={`flex min-h-11 shrink-0 items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all sm:gap-2 ${
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
