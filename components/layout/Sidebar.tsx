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
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={handleClose}
            aria-label="Close sidebar"
          />
        )}

        <div
          className={`
      fixed lg:sticky top-0 left-0 z-50 h-dvh
      w-[min(18rem,86vw)] bg-zinc-900 border-r border-zinc-800 flex flex-col
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
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={handleClose}
          aria-label="Close sidebar"
        />
      )}

      <div
        className={`
    fixed lg:sticky top-0 left-0 z-50 h-dvh
    w-[min(18rem,86vw)] bg-zinc-900 border-r border-zinc-800 flex flex-col
    transition-transform duration-300 ease-in-out lg:translate-x-0
    ${isOpen ? "translate-x-0" : "-translate-x-full"}
   `}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 flex h-11 w-11 items-center justify-center rounded-xl text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/60 lg:hidden"
          aria-label="Close sidebar"
        >
          <HiXMark className="w-5 h-5" />
        </button>

        <div className="border-b border-zinc-800 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] sm:p-6">
          <Link prefetch={false} href="/" className="flex items-center gap-3 mb-4">
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

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <div className="mb-6">
            <p className="px-3 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Main
            </p>
            {publicNavigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link prefetch={false} key={item.name}
                  href={item.href}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
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
                <Link prefetch={false} href={`/users/${user.handle || user.id}`}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    pathname === `/users/${user.handle || user.id}`
                      ? "bg-red-600 text-white shadow-lg "
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  <HiUser className="w-5 h-5" />
                  My Profile
                </Link>
                <Link prefetch={false} href="/developer"
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
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
                    <Link prefetch={false} key={item.name}
                      href={item.href}
                      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
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
          <div className="border-t border-zinc-800 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <Link prefetch={false} href={`/users/${user.handle || user.id}`}
              className="group -mx-2 mb-3 flex min-h-12 items-center gap-3 rounded-xl p-2 transition-colors hover:bg-zinc-800/50"
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
              className="min-h-11 w-full rounded-xl px-3 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white"
            >
              Sign Out
            </button>
            <div className="mt-4 pt-4 border-t border-zinc-800/50 flex flex-wrap gap-x-4 gap-y-2">
              <Link prefetch={false} href="/privacy"
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link prefetch={false} href="/imprint"
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Imprint
              </Link>
            </div>
          </div>
        ) : (
          <div className="border-t border-zinc-800 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <Link prefetch={false} href="/auth/signin"
              className="block min-h-11 w-full rounded-xl bg-red-600 px-4 py-2.5 text-center text-sm font-medium text-white transition-all hover:bg-red-700"
            >
              Sign In
            </Link>
            <div className="mt-4 pt-4 border-t border-zinc-800/50 flex flex-wrap gap-x-4 gap-y-2">
              <Link prefetch={false} href="/privacy"
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link prefetch={false} href="/imprint"
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
