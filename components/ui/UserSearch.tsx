"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiMagnifyingGlass, HiUserPlus, HiXMark } from "react-icons/hi2";
import UserAvatar from "./UserAvatar";

interface User {
  id: string;
  name: string;
  email: string;
  hackclubId: string;
  avatarS3Key?: string | null;
  handle?: string | null;
}
interface UserSearchProps {
  onSelectUser: (user: User) => void;
  excludeUserIds?: string[];
  placeholder?: string;
  isLoading?: boolean;
}
export default function UserSearch({
  onSelectUser,
  excludeUserIds = [],
  placeholder = "Search users by name or email...",
  isLoading = false,
}: UserSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  useEffect(() => {
    if (showDropdown && searchRef.current) {
      const updatePosition = () => {
        const rect = searchRef.current!.getBoundingClientRect();
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
  }, [showDropdown]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        const dropdown = document.getElementById("user-search-dropdown");
        if (dropdown?.contains(event.target as Node)) {
          return;
        }
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }
      setIsSearching(true);
      try {
        const { searchUsers } = await import("@/app/actions/users");
        const result = await searchUsers(searchQuery);
        if (result.success && result.users) {
          const filtered = result.users.filter(
            (user: User) => !excludeUserIds.includes(user.id),
          );
          setSearchResults(filtered);
          setShowDropdown(filtered.length > 0);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, excludeUserIds]);
  const handleSelectUser = (user: User) => {
    onSelectUser(user);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  };
  const handleClear = () => {
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  };
  return (
    <div ref={searchRef} className="relative">
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
          <HiMagnifyingGlass className="w-5 h-5" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          disabled={isLoading}
          className="w-full pl-10 pr-10 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none  focus:border-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <HiXMark className="w-5 h-5" />
          </button>
        )}
      </div>

      {showDropdown &&
        createPortal(
          <div
            id="user-search-dropdown"
            className="fixed z-[9999] bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl max-h-64 overflow-y-auto"
            style={{
              top: dropdownStyle.top,
              left: dropdownStyle.left,
              width: dropdownStyle.width,
            }}
          >
            {isSearching ? (
              <div className="p-4 text-center text-zinc-500">Searching...</div>
            ) : searchResults.length === 0 ? (
              <div className="p-4 text-center text-zinc-500">
                No users found
              </div>
            ) : (
              <div className="py-2">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelectUser(user)}
                    className="w-full px-4 py-3 text-left hover:bg-zinc-800 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar user={user} size="sm" />
                      <div>
                        <div className="text-white font-medium">
                          {user.name}
                        </div>
                        {user.handle && (
                          <div className="text-zinc-400 text-xs">
                            @{user.handle}
                          </div>
                        )}
                      </div>
                    </div>
                    <HiUserPlus className="w-5 h-5 text-zinc-500 group-hover:text-red-600 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
