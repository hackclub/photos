"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  HiCalendar,
  HiFolder,
  HiHashtag,
  HiMagnifyingGlass,
  HiPhoto,
  HiXMark,
} from "react-icons/hi2";
import { globalSearch, type SearchResults } from "@/app/actions/search";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import UserAvatar from "@/components/ui/UserAvatar";
export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults(null);
        return;
      }
      setLoading(true);
      try {
        const response = await globalSearch(query);
        if (response.success && response.results) {
          setResults(response.results);
          setIsOpen(true);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  const handleSelect = (path: string) => {
    setIsOpen(false);
    setQuery("");
    router.push(path);
  };
  const hasResults =
    results &&
    (results.users.length > 0 ||
      results.events.length > 0 ||
      results.series.length > 0 ||
      results.media.length > 0 ||
      results.tags.length > 0);
  return (
    <div className="relative w-full max-w-md" ref={searchRef}>
      <div className="relative">
        <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-5 h-5" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.length >= 2) setIsOpen(true);
          }}
          onFocus={() => {
            if (query.length >= 2) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              setIsOpen(false);
              router.push(`/search?q=${encodeURIComponent(query.trim())}`);
            }
          }}
          placeholder="Search events, series, people..."
          className="w-full pl-10 pr-10 py-2 bg-zinc-800 border border-zinc-700 rounded-full text-sm text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults(null);
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
          >
            <HiXMark className="w-5 h-5" />
          </button>
        )}
      </div>

      {isOpen && (query.length >= 2 || loading) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50 max-h-[80vh] overflow-y-auto">
          {loading ? (
            <div className="p-4 flex justify-center">
              <LoadingSpinner size="sm" />
            </div>
          ) : !hasResults ? (
            <div className="p-4 text-center text-zinc-500 text-sm">
              No results found for "{query}"
            </div>
          ) : (
            <div className="py-2">
              {results?.tags.length! > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Tags
                  </div>
                  {results?.tags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => handleSelect(`/search?tag=${tag.id}`)}
                      className="w-full px-4 py-2 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <HiHashtag className="w-5 h-5 text-zinc-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {tag.name}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          Tag
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results?.events.length! > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Events
                  </div>
                  {results?.events.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => handleSelect(`/events/${event.slug}`)}
                      className="w-full px-4 py-2 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <HiCalendar className="w-5 h-5 text-zinc-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {event.name}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          {event.location || "No location"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results?.series.length! > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Series
                  </div>
                  {results?.series.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelect(`/series/${s.slug}`)}
                      className="w-full px-4 py-2 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <HiFolder className="w-5 h-5 text-zinc-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {s.name}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          Series
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results?.users.length! > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    People
                  </div>
                  {results?.users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleSelect(`/users/${u.handle || u.id}`)}
                      className="w-full px-4 py-2 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left"
                    >
                      <UserAvatar user={u} size="sm" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {u.name}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results?.media.length! > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Photos & Videos
                  </div>
                  {results?.media.map((m) => (
                    <button
                      key={m.id}
                      onClick={() =>
                        handleSelect(`/events/${m.event.slug}?photo=${m.id}`)
                      }
                      className="w-full px-4 py-2 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {m.thumbnailS3Key || m.s3Key ? (
                          <HiPhoto className="w-5 h-5 text-zinc-400" />
                        ) : (
                          <HiPhoto className="w-5 h-5 text-zinc-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {m.caption || m.filename}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          in {m.event.name}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
