"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect } from "react";
import {
  HiCalendar,
  HiClipboardDocumentList,
  HiCodeBracket,
  HiCog6Tooth,
  HiCommandLine,
  HiExclamationTriangle,
  HiFolder,
  HiHome,
  HiMap,
  HiRss,
  HiServer,
  HiTag,
  HiUser,
  HiUsers,
  HiXMark,
} from "react-icons/hi2";
import UserAvatar from "@/components/ui/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import GlobalSearch from "./GlobalSearch";

const publicNavigation = [
  { name: "Home", href: "/", icon: HiHome },
  { name: "Feed", href: "/feed", icon: HiRss },
  { name: "Events", href: "/events", icon: HiCalendar },
  { name: "Series", href: "/series", icon: HiFolder },
  { name: "Map", href: "/map", icon: HiMap },
  { name: "Tags", href: "/tags", icon: HiTag },
];
const adminNavigation = [
  { name: "Admin Dashboard", href: "/admin", icon: HiCog6Tooth },
  { name: "Reports", href: "/admin/reports", icon: HiExclamationTriangle },
  { name: "Manage Events", href: "/admin/events", icon: HiCalendar },
  { name: "Manage Series", href: "/admin/series", icon: HiFolder },
  { name: "Manage Tags", href: "/admin/tags", icon: HiTag },
  { name: "Users", href: "/admin/users", icon: HiUsers },
  { name: "Storage", href: "/admin/storage", icon: HiServer },
  { name: "Audit Logs", href: "/admin/audit", icon: HiClipboardDocumentList },
  { name: "API Keys", href: "/admin/api-keys", icon: HiCommandLine },
];
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}
export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);
  useEffect(() => {
    void pathname;
    handleClose();
  }, [pathname, handleClose]);
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      if (window.innerWidth < 1024) {
        document.body.style.overflow = "hidden";
      }
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleClose]);
  if (pathname === "/onboarding") {
    return null;
  }
  if (loading) {
    return (
      <>
        {isOpen && (
          <button
            type="button"
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={handleClose}
            aria-label="Close sidebar"
          />
        )}

        <div
          className={`
     fixed lg:sticky top-0 left-0 z-50 h-screen
     w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col
     transition-transform duration-300 ease-in-out lg:translate-x-0
     ${isOpen ? "translate-x-0" : "-translate-x-full"}
    `}
        >
          <div className="p-6 border-b border-zinc-800">
            <div className="h-8 bg-zinc-800 rounded-lg animate-pulse" />
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={handleClose}
          aria-label="Close sidebar"
        />
      )}

      <div
        className={`
    fixed lg:sticky top-0 left-0 z-50 h-screen
    w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col
    transition-transform duration-300 ease-in-out lg:translate-x-0
    ${isOpen ? "translate-x-0" : "-translate-x-full"}
   `}
      >
        <button
          type="button"
          onClick={handleClose}
          className="lg:hidden absolute top-4 right-4 p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all z-10"
          aria-label="Close sidebar"
        >
          <HiXMark className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-zinc-800">
          <Link href="/" className="flex items-center gap-3 mb-4">
            <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
              <Image
                src="/hackclub-icon.png"
                alt="Hack Club Logo"
                fill
                className="object-cover"
              />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Hack Club</h1>
              <p className="text-xs text-zinc-400">Photos</p>
            </div>
          </Link>
          <GlobalSearch />
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="mb-6">
            <p className="px-3 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Main
            </p>
            {publicNavigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-red-600 text-white shadow-lg "
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}

            {user && (
              <>
                <Link
                  href={`/users/${user.handle || user.id}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    pathname === `/users/${user.handle || user.id}`
                      ? "bg-red-600 text-white shadow-lg "
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  <HiUser className="w-5 h-5" />
                  My Profile
                </Link>
                <Link
                  href="/developer"
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    pathname === "/developer"
                      ? "bg-red-600 text-white shadow-lg "
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  <HiCodeBracket className="w-5 h-5" />
                  Developer
                </Link>
              </>
            )}
          </div>

          {(user?.isGlobalAdmin || user?.hasAdminAccess) && (
            <div className="mb-6">
              <p className="px-3 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Administration
              </p>
              {adminNavigation
                .filter((item) => {
                  if (user?.isGlobalAdmin) return true;
                  return (
                    item.href === "/admin/events" ||
                    item.href === "/admin/series"
                  );
                })
                .map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? "bg-red-600 text-white shadow-lg "
                          : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.name}
                    </Link>
                  );
                })}
            </div>
          )}
        </nav>

        {user ? (
          <div className="p-4 border-t border-zinc-800">
            <Link
              href={`/users/${user.handle || user.id}`}
              className="flex items-center gap-3 mb-3 hover:bg-zinc-800/50 p-2 -mx-2 rounded-lg transition-colors group"
            >
              <UserAvatar user={user} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate group-hover:text-red-400 transition-colors">
                  {user.name}
                </p>
                <p className="text-xs text-zinc-400 truncate">{user.email}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="w-full px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
            >
              Sign Out
            </button>
            <div className="mt-4 pt-4 border-t border-zinc-800/50 flex flex-wrap gap-x-4 gap-y-2">
              <Link
                href="/privacy"
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/imprint"
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Imprint
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-4 border-t border-zinc-800">
            <Link
              href="/auth/signin"
              className="w-full block px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg text-center transition-all"
            >
              Sign In
            </Link>
            <div className="mt-4 pt-4 border-t border-zinc-800/50 flex flex-wrap gap-x-4 gap-y-2">
              <Link
                href="/privacy"
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/imprint"
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Imprint
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
