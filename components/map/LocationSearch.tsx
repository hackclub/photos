"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiArrowPath, HiMagnifyingGlass, HiMapPin } from "react-icons/hi2";
import { NOMINATIM_API_URL } from "@/lib/constants";

interface Location {
  displayName: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}
interface NominatimResult {
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    country?: string;
  };
  lat: string;
  lon: string;
}
interface LocationSearchProps {
  onLocationSelect: (location: Location) => void;
  placeholder?: string;
}
export default function LocationSearch({
  onLocationSelect,
  placeholder = "Search for a location...",
}: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  useEffect(() => {
    if (showResults && wrapperRef.current) {
      const updatePosition = () => {
        const rect = wrapperRef.current!.getBoundingClientRect();
        setDropdownStyle({
          top: rect.bottom + 8,
          left: rect.left,
          width: rect.width,
        });
      };
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [showResults]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        const dropdown = document.getElementById("location-search-dropdown");
        if (dropdown?.contains(event.target as Node)) {
          return;
        }
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const searchLocation = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `${NOMINATIM_API_URL}/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&addressdetails=1`,
        {
          headers: {
            "User-Agent": "Hack Club Photos App",
          },
        },
      );
      if (!response.ok) throw new Error("Failed to search location");
      const data = await response.json();
      const locations: Location[] = (data as NominatimResult[]).map((item) => ({
        displayName: item.display_name,
        city:
          item.address?.city ||
          item.address?.town ||
          item.address?.village ||
          item.address?.county ||
          "",
        country: item.address?.country || "",
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
      }));
      setResults(locations);
      setShowResults(true);
    } catch (error) {
      console.error("Error searching location:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      searchLocation(value);
    }, 500);
  };
  const handleSelectLocation = (location: Location) => {
    setQuery(location.displayName);
    setShowResults(false);
    setResults([]);
    onLocationSelect(location);
  };
  return (
    <div ref={wrapperRef} className="relative">
      <label
        htmlFor="location-search"
        className="block text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2"
      >
        <HiMapPin />
        Search Location
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {loading ? (
            <HiArrowPath className="w-5 h-5 text-zinc-500 animate-spin" />
          ) : (
            <HiMagnifyingGlass className="w-5 h-5 text-zinc-500" />
          )}
        </div>
        <input
          type="text"
          id="location-search"
          value={query}
          onChange={handleInputChange}
          onFocus={() => results.length > 0 && setShowResults(true)}
          className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
          placeholder={placeholder}
        />
      </div>

      {showResults &&
        results.length > 0 &&
        createPortal(
          <div
            id="location-search-dropdown"
            className="fixed z-[9999] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-64 overflow-y-auto"
            style={{
              top: dropdownStyle.top,
              left: dropdownStyle.left,
              width: dropdownStyle.width,
            }}
          >
            {results.map((location) => (
              <button
                key={`${location.latitude}-${location.longitude}`}
                type="button"
                onClick={() => handleSelectLocation(location)}
                className="w-full px-4 py-3 text-left hover:bg-zinc-700 transition-colors border-b border-zinc-700 last:border-b-0"
              >
                <div className="flex items-start gap-2">
                  <HiMapPin className="w-5 h-5 text-red-400 mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {location.displayName}
                    </p>
                    <p className="text-zinc-400 text-xs mt-1">
                      {location.city && `${location.city}, `}
                      {location.country}
                    </p>
                    <p className="text-zinc-500 text-xs mt-1">
                      {location.latitude.toFixed(4)},{" "}
                      {location.longitude.toFixed(4)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>,
          document.body,
        )}

      {showResults &&
        results.length === 0 &&
        query.trim() &&
        !loading &&
        createPortal(
          <div
            className="fixed z-[9999] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl px-4 py-3"
            style={{
              top: dropdownStyle.top,
              left: dropdownStyle.left,
              width: dropdownStyle.width,
            }}
          >
            <p className="text-zinc-400 text-sm">No locations found</p>
          </div>,
          document.body,
        )}

      <p className="text-xs text-zinc-500 mt-2">
        Search for a location to auto-fill city, country, and coordinates
      </p>
    </div>
  );
}
