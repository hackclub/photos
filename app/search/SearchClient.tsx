"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiAdjustmentsHorizontal,
  HiCalendar,
  HiMagnifyingGlass,
  HiPhoto,
  HiTag,
  HiUser,
  HiVideoCamera,
  HiXMark,
} from "react-icons/hi2";
import {
  advancedSearch,
  getSearchFilterOptions,
  type SearchResults,
} from "@/app/actions/search";
import SearchGallery, { type MediaItem } from "@/app/search/SearchGallery";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import UserAvatar from "@/components/ui/UserAvatar";

interface Props {
  initialQuery: string;
  currentUserId?: string;
  isAdmin?: boolean;
}
interface FilterOptions {
  events: {
    id: string;
    name: string;
  }[];
  series: {
    id: string;
    name: string;
  }[];
  users: {
    id: string;
    name: string;
    handle: string | null;
  }[];
  tags: {
    id: string;
    name: string;
    color: string | null;
  }[];
}
export default function SearchClient({
  initialQuery,
  currentUserId,
  isAdmin,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    events: [],
    series: [],
    users: [],
    tags: [],
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [showFilters, setShowFilters] = useState(false);
  const filters = useMemo(() => {
    return {
      type: (searchParams.get("type") as "all" | "photo" | "video") || "all",
      dateRange:
        (searchParams.get("date") as
          | "any"
          | "today"
          | "yesterday"
          | "week"
          | "month"
          | "year") || "any",
      uploaderIds:
        searchParams.get("uploader")?.split(",").filter(Boolean) || [],
      eventIds: searchParams.get("event")?.split(",").filter(Boolean) || [],
      seriesIds: searchParams.get("series")?.split(",").filter(Boolean) || [],
      tagIds: searchParams.get("tag")?.split(",").filter(Boolean) || [],
      mentionedUserIds:
        searchParams.get("mention")?.split(",").filter(Boolean) || [],
    };
  }, [searchParams]);
  useEffect(() => {
    const loadOptions = async () => {
      const response = await getSearchFilterOptions();
      if (response.success && response.data) {
        setFilterOptions(response.data);
      }
    };
    loadOptions();
  }, []);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    const performSearch = async () => {
      const searchQuery = searchParams.get("q") || "";
      if (searchQuery !== query) {
        setQuery(searchQuery);
      }
      const hasActiveFilters =
        filters.tagIds.length > 0 ||
        filters.uploaderIds.length > 0 ||
        filters.eventIds.length > 0 ||
        filters.seriesIds.length > 0 ||
        filters.mentionedUserIds.length > 0 ||
        filters.type !== "all" ||
        filters.dateRange !== "any";
      if (!searchQuery && !hasActiveFilters) {
        setResults(null);
        setHasSearched(false);
        return;
      }
      setLoading(true);
      setHasSearched(true);
      setShowSuggestions(false);
      try {
        const response = await advancedSearch(searchQuery, filters);
        if (response.success && response.results) {
          const typedResults = {
            ...response.results,
            media: response.results.media.map((m) => ({
              ...m,
              exifData: (m.exifData as Record<string, unknown> | null) || null,
            })),
          };
          setResults(typedResults as any);
        }
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setLoading(false);
      }
    };
    performSearch();
  }, [query, searchParams, filters]);
  const updateUrl = (newQuery: string, newFilters: typeof filters) => {
    const params = new URLSearchParams();
    if (newQuery) params.set("q", newQuery);
    if (newFilters.type !== "all") params.set("type", newFilters.type);
    if (newFilters.dateRange !== "any")
      params.set("date", newFilters.dateRange);
    if (newFilters.uploaderIds.length > 0)
      params.set("uploader", newFilters.uploaderIds.join(","));
    if (newFilters.eventIds.length > 0)
      params.set("event", newFilters.eventIds.join(","));
    if (newFilters.seriesIds.length > 0)
      params.set("series", newFilters.seriesIds.join(","));
    if (newFilters.tagIds.length > 0)
      params.set("tag", newFilters.tagIds.join(","));
    if (newFilters.mentionedUserIds.length > 0)
      params.set("mention", newFilters.mentionedUserIds.join(","));
    router.push(`/search?${params.toString()}`);
  };
  const handleSearchClick = () => {
    updateUrl(query, filters);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      updateUrl(query, filters);
      setShowSuggestions(false);
    }
  };
  const clearFilters = () => {
    updateUrl(query, {
      type: "all",
      dateRange: "any",
      uploaderIds: [],
      eventIds: [],
      seriesIds: [],
      tagIds: [],
      mentionedUserIds: [],
    });
  };
  const getSelectedName = (
    id: string,
    list: {
      id: string;
      name: string;
    }[],
  ) => {
    return list.find((item) => item.id === id)?.name || "Select...";
  };
  const getSuggestions = () => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    const events = filterOptions.events
      .filter((e) => e.name.toLowerCase().includes(q))
      .slice(0, 3);
    const series = filterOptions.series
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 3);
    const tags = filterOptions.tags
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, 3);
    const users = filterOptions.users
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.handle?.toLowerCase().includes(q),
      )
      .slice(0, 3);
    const hasSuggestions =
      events.length > 0 ||
      series.length > 0 ||
      tags.length > 0 ||
      users.length > 0;
    if (!hasSuggestions) return null;
    return { events, series, tags, users };
  };
  const suggestions = getSuggestions();
  const applySuggestion = (
    type: "event" | "series" | "tag" | "user",
    id: string,
  ) => {
    const newFilters = { ...filters };
    if (type === "event" && !newFilters.eventIds.includes(id))
      newFilters.eventIds = [...newFilters.eventIds, id];
    if (type === "series" && !newFilters.seriesIds.includes(id))
      newFilters.seriesIds = [...newFilters.seriesIds, id];
    if (type === "tag" && !newFilters.tagIds.includes(id))
      newFilters.tagIds = [...newFilters.tagIds, id];
    if (type === "user" && !newFilters.mentionedUserIds.includes(id))
      newFilters.mentionedUserIds = [...newFilters.mentionedUserIds, id];
    updateUrl("", newFilters);
    setQuery("");
  };
  const removeFilter = (key: keyof typeof filters, id?: string) => {
    const newFilters = { ...filters };
    if (key === "eventIds" && id) {
      newFilters.eventIds = newFilters.eventIds.filter((i) => i !== id);
    } else if (key === "seriesIds" && id) {
      newFilters.seriesIds = newFilters.seriesIds.filter((i) => i !== id);
    } else if (key === "tagIds" && id) {
      newFilters.tagIds = newFilters.tagIds.filter((i) => i !== id);
    } else if (key === "uploaderIds" && id) {
      newFilters.uploaderIds = newFilters.uploaderIds.filter((i) => i !== id);
    } else if (key === "mentionedUserIds" && id) {
      newFilters.mentionedUserIds = newFilters.mentionedUserIds.filter(
        (i) => i !== id,
      );
    } else {
      if (key === "type") newFilters.type = "all";
      if (key === "dateRange") newFilters.dateRange = "any";
    }
    updateUrl(query, newFilters);
  };
  return (
    <div className="min-h-screen bg-black">
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-4">
            {(filters.eventIds.length > 0 ||
              filters.seriesIds.length > 0 ||
              filters.tagIds.length > 0 ||
              filters.uploaderIds.length > 0 ||
              filters.mentionedUserIds.length > 0 ||
              filters.type !== "all" ||
              filters.dateRange !== "any") && (
              <div className="flex flex-wrap gap-2">
                {filters.eventIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 text-sm border border-blue-500/20"
                  >
                    <HiCalendar className="w-4 h-4" />
                    {getSelectedName(id, filterOptions.events)}
                    <button
                      onClick={() => removeFilter("eventIds", id)}
                      className="hover:text-white ml-1"
                    >
                      <HiXMark className="w-4 h-4" />
                    </button>
                  </span>
                ))}
                {filters.seriesIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-500/10 text-purple-400 text-sm border border-purple-500/20"
                  >
                    <HiPhoto className="w-4 h-4" />
                    {getSelectedName(id, filterOptions.series)}
                    <button
                      onClick={() => removeFilter("seriesIds", id)}
                      className="hover:text-white ml-1"
                    >
                      <HiXMark className="w-4 h-4" />
                    </button>
                  </span>
                ))}
                {filters.tagIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-400 text-sm border border-green-500/20"
                  >
                    <HiTag className="w-4 h-4" />
                    {getSelectedName(id, filterOptions.tags)}
                    <button
                      onClick={() => removeFilter("tagIds", id)}
                      className="hover:text-white ml-1"
                    >
                      <HiXMark className="w-4 h-4" />
                    </button>
                  </span>
                ))}
                {filters.uploaderIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-sm border border-yellow-500/20"
                  >
                    <HiUser className="w-4 h-4" />
                    {getSelectedName(id, filterOptions.users)}
                    <button
                      onClick={() => removeFilter("uploaderIds", id)}
                      className="hover:text-white ml-1"
                    >
                      <HiXMark className="w-4 h-4" />
                    </button>
                  </span>
                ))}
                {filters.mentionedUserIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-sm border border-yellow-500/20"
                  >
                    <HiUser className="w-4 h-4" />
                    {getSelectedName(id, filterOptions.users)}
                    <button
                      onClick={() => removeFilter("mentionedUserIds", id)}
                      className="hover:text-white ml-1"
                    >
                      <HiXMark className="w-4 h-4" />
                    </button>
                  </span>
                ))}
                {filters.type !== "all" && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-800 text-zinc-300 text-sm border border-zinc-700">
                    {filters.type === "photo" ? (
                      <HiPhoto className="w-4 h-4" />
                    ) : (
                      <HiVideoCamera className="w-4 h-4" />
                    )}
                    {filters.type === "photo" ? "Photos" : "Videos"}
                    <button
                      onClick={() => removeFilter("type")}
                      className="hover:text-white ml-1"
                    >
                      <HiXMark className="w-4 h-4" />
                    </button>
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-2 relative" ref={searchContainerRef}>
              <div className="relative flex-1">
                <HiMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 w-5 h-5" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search photos, videos, events..."
                  className="w-full pl-12 pr-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                  >
                    <HiXMark className="w-5 h-5" />
                  </button>
                )}

                {showSuggestions && suggestions && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                    {suggestions.events.length > 0 && (
                      <div className="p-2">
                        <div className="text-xs font-semibold text-zinc-500 px-2 py-1 uppercase tracking-wider">
                          Events
                        </div>
                        {suggestions.events.map((event) => (
                          <button
                            key={event.id}
                            onClick={() => applySuggestion("event", event.id)}
                            className="w-full text-left px-3 py-2 hover:bg-zinc-800 rounded-lg flex items-center gap-2 text-sm text-zinc-200 transition-colors"
                          >
                            <HiCalendar className="w-4 h-4 text-blue-400" />
                            {event.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {suggestions.series.length > 0 && (
                      <div className="p-2 border-t border-zinc-800">
                        <div className="text-xs font-semibold text-zinc-500 px-2 py-1 uppercase tracking-wider">
                          Series
                        </div>
                        {suggestions.series.map((series) => (
                          <button
                            key={series.id}
                            onClick={() => applySuggestion("series", series.id)}
                            className="w-full text-left px-3 py-2 hover:bg-zinc-800 rounded-lg flex items-center gap-2 text-sm text-zinc-200 transition-colors"
                          >
                            <HiPhoto className="w-4 h-4 text-purple-400" />
                            {series.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {suggestions.tags.length > 0 && (
                      <div className="p-2 border-t border-zinc-800">
                        <div className="text-xs font-semibold text-zinc-500 px-2 py-1 uppercase tracking-wider">
                          Tags
                        </div>
                        {suggestions.tags.map((tag) => (
                          <button
                            key={tag.id}
                            onClick={() => applySuggestion("tag", tag.id)}
                            className="w-full text-left px-3 py-2 hover:bg-zinc-800 rounded-lg flex items-center gap-2 text-sm text-zinc-200 transition-colors"
                          >
                            <HiTag className="w-4 h-4 text-green-400" />#
                            {tag.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {suggestions.users.length > 0 && (
                      <div className="p-2 border-t border-zinc-800">
                        <div className="text-xs font-semibold text-zinc-500 px-2 py-1 uppercase tracking-wider">
                          People
                        </div>
                        {suggestions.users.map((user) => (
                          <button
                            key={user.id}
                            onClick={() => applySuggestion("user", user.id)}
                            className="w-full text-left px-3 py-2 hover:bg-zinc-800 rounded-lg flex items-center gap-2 text-sm text-zinc-200 transition-colors"
                          >
                            <HiUser className="w-4 h-4 text-yellow-400" />
                            {user.name}
                            {user.handle && (
                              <span className="text-zinc-500 text-xs">
                                @{user.handle}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 rounded-xl border transition-colors flex items-center gap-2 ${
                  showFilters
                    ? "bg-zinc-800 border-zinc-600 text-white"
                    : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white"
                }`}
              >
                <HiAdjustmentsHorizontal className="w-5 h-5" />
                <span className="hidden sm:inline">Filters</span>
              </button>
              <button
                onClick={handleSearchClick}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors"
              >
                Search
              </button>
            </div>

            {showFilters && (
              <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-6 animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      Type
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          updateUrl(query, { ...filters, type: "all" })
                        }
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          filters.type === "all"
                            ? "bg-zinc-700 text-white"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() =>
                          updateUrl(query, { ...filters, type: "photo" })
                        }
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                          filters.type === "photo"
                            ? "bg-zinc-700 text-white"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                        }`}
                      >
                        <HiPhoto className="w-4 h-4" />
                        Photo
                      </button>
                      <button
                        onClick={() =>
                          updateUrl(query, { ...filters, type: "video" })
                        }
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                          filters.type === "video"
                            ? "bg-zinc-700 text-white"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                        }`}
                      >
                        <HiVideoCamera className="w-4 h-4" />
                        Video
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      Date
                    </label>
                    <select
                      value={filters.dateRange}
                      onChange={(e) =>
                        updateUrl(query, {
                          ...filters,
                          dateRange: e.target.value as
                            | "any"
                            | "today"
                            | "yesterday"
                            | "week"
                            | "month"
                            | "year",
                        })
                      }
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600"
                    >
                      <option value="any">Any time</option>
                      <option value="today">Today</option>
                      <option value="yesterday">Yesterday</option>
                      <option value="week">Past week</option>
                      <option value="month">Past month</option>
                      <option value="year">Past year</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      Add Person
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          applySuggestion("user", e.target.value);
                      }}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600"
                    >
                      <option value="">Select user...</option>
                      {filterOptions.users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} {user.handle ? `(@${user.handle})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      Add Event
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          applySuggestion("event", e.target.value);
                      }}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600"
                    >
                      <option value="">Select event...</option>
                      {filterOptions.events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      Add Series
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          applySuggestion("series", e.target.value);
                      }}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600"
                    >
                      <option value="">Select series...</option>
                      {filterOptions.series.map((series) => (
                        <option key={series.id} value={series.id}>
                          {series.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      Add Tag
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          applySuggestion("tag", e.target.value);
                      }}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600"
                    >
                      <option value="">Select tag...</option>
                      {filterOptions.tags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={clearFilters}
                      className="w-full px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors border border-transparent hover:border-red-400/20"
                    >
                      Clear all filters
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative min-h-[50vh]">
        {loading && (
          <div
            className={`flex flex-col items-center justify-center z-20 ${
              results
                ? "absolute inset-0 bg-black/60 backdrop-blur-[1px] rounded-xl"
                : "py-20"
            }`}
          >
            <LoadingSpinner size="xl" />
            <p className="mt-4 text-zinc-400 font-medium">
              {results ? "Updating results..." : "Searching..."}
            </p>
          </div>
        )}

        {!hasSearched && !loading && !results && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6">
              <HiMagnifyingGlass className="w-10 h-10 text-zinc-700" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Search Hack Club Photos
            </h2>
            <p className="text-zinc-400 max-w-md">
              Find photos from events, search by tags, or look for specific
              people. Use the filters to narrow down your search.
            </p>
          </div>
        )}

        {results && (
          <div className={`space-y-12 ${loading ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-2 text-zinc-400 pb-4 border-b border-zinc-800">
              <span>Found</span>
              {results.media.length > 0 && (
                <span className="text-white font-medium">
                  {results.media.length} photos
                </span>
              )}
              {results.events.length > 0 && (
                <>
                  <span>•</span>
                  <span className="text-white font-medium">
                    {results.events.length} events
                  </span>
                </>
              )}
              {results.users.length > 0 && (
                <>
                  <span>•</span>
                  <span className="text-white font-medium">
                    {results.users.length} people
                  </span>
                </>
              )}
            </div>

            {results.events.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <HiCalendar className="w-5 h-5 text-zinc-400" />
                  Events
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.events.map((event) => (
                    <a
                      key={event.id}
                      href={`/events/${event.slug}`}
                      className="block p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-all group"
                    >
                      <h4 className="font-bold text-white group-hover:text-red-400 transition-colors">
                        {event.name}
                      </h4>
                      <p className="text-sm text-zinc-400 mt-1">
                        {event.location || "No location"}
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                        <HiCalendar className="w-4 h-4" />
                        {event.eventDate
                          ? new Date(event.eventDate).toLocaleDateString()
                          : "No date"}
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {results.users.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <HiUser className="w-5 h-5 text-zinc-400" />
                  People
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {results.users.map((user) => (
                    <a
                      key={user.id}
                      href={`/users/${user.handle || user.id}`}
                      className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-all"
                    >
                      <UserAvatar user={user} size="sm" />
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate">
                          {user.name}
                        </p>
                        {user.handle && (
                          <p className="text-xs text-zinc-500 truncate">
                            @{user.handle}
                          </p>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {results.media.length > 0 ? (
              <section>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <HiPhoto className="w-5 h-5 text-zinc-400" />
                  Photos & Videos
                </h3>
                <SearchGallery
                  media={results.media as unknown as MediaItem[]}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                />
              </section>
            ) : (
              hasSearched &&
              results.events.length === 0 &&
              results.users.length === 0 && (
                <div className="text-center py-12 bg-zinc-900/30 rounded-xl border border-zinc-800 border-dashed">
                  <p className="text-zinc-400">
                    No results found matching your criteria.
                  </p>
                  <button
                    onClick={clearFilters}
                    className="mt-2 text-red-400 hover:text-red-300 text-sm"
                  >
                    Clear filters and try again
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
