"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type PointerEvent, useCallback, useEffect } from "react";
import {
  HiArrowLeftOnRectangle,
  HiArrowRightOnRectangle,
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
  HiSparkles,
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
  {
    name: "Blur Requests",
    href: "/admin/blur-requests",
    icon: HiExclamationTriangle,
  },
  { name: "Manage Events", href: "/admin/events", icon: HiCalendar },
  { name: "Manage Series", href: "/admin/series", icon: HiFolder },
  { name: "Manage Tags", href: "/admin/tags", icon: HiTag },
  { name: "Users", href: "/admin/users", icon: HiUsers },
  { name: "Storage", href: "/admin/storage", icon: HiServer },
  { name: "Face Indexing", href: "/admin/faces", icon: HiSparkles },
  { name: "Audit Logs", href: "/admin/audit", icon: HiClipboardDocumentList },
  { name: "API Keys", href: "/admin/api-keys", icon: HiCommandLine },
];

const compactCopyClasses =
  "whitespace-nowrap lg:opacity-0 lg:transition-opacity lg:duration-150 lg:group-hover/sidebar:opacity-100 lg:group-hover/sidebar:delay-75 lg:group-focus-within/sidebar:opacity-100 lg:group-focus-within/sidebar:delay-75";

const sectionHeadingClasses =
  "mb-2 max-h-6 overflow-hidden px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 transition-all duration-150 lg:mb-0 lg:max-h-0 lg:opacity-0 lg:group-hover/sidebar:mb-2 lg:group-hover/sidebar:max-h-6 lg:group-hover/sidebar:opacity-100 lg:group-focus-within/sidebar:mb-2 lg:group-focus-within/sidebar:max-h-6 lg:group-focus-within/sidebar:opacity-100";

function releasePointerFocus(event: PointerEvent<HTMLElement>) {
  if (!(event.target instanceof Element)) return;

  const control = event.target.closest("a, button");
  if (control instanceof HTMLElement) control.blur();
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  logoUrl: string;
}
export default function Sidebar({ isOpen, onClose, logoUrl }: SidebarProps) {
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
            fixed left-0 top-0 z-50 h-dvh w-[min(18rem,86vw)]
            transition-transform duration-300 ease-in-out motion-reduce:transition-none
            lg:sticky lg:w-20 lg:flex-none lg:translate-x-0 lg:transition-none
            ${isOpen ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          <aside className="sidebar-panel group/sidebar relative flex h-full w-full flex-col overflow-x-clip border-r border-zinc-800 bg-zinc-900 lg:absolute lg:inset-y-0 lg:left-0 lg:w-20 lg:transition-[width,box-shadow] lg:duration-200 lg:ease-out lg:hover:w-72 lg:hover:shadow-2xl lg:hover:shadow-black/40 lg:focus-within:w-72 lg:focus-within:shadow-2xl lg:focus-within:shadow-black/40 motion-reduce:transition-none">
            <div className="border-b border-zinc-800 p-4 lg:p-4">
              <div className="h-10 w-10 animate-pulse rounded-lg bg-zinc-800" />
            </div>
          </aside>
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
          fixed left-0 top-0 z-50 h-dvh w-[min(18rem,86vw)]
          transition-transform duration-300 ease-in-out motion-reduce:transition-none
          lg:sticky lg:w-20 lg:flex-none lg:translate-x-0 lg:transition-none
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <aside
          onPointerUp={releasePointerFocus}
          className="sidebar-panel group/sidebar relative flex h-full w-full flex-col overflow-x-clip border-r border-zinc-800 bg-zinc-900 lg:absolute lg:inset-y-0 lg:left-0 lg:w-20 lg:transition-[width,box-shadow] lg:duration-200 lg:ease-out lg:hover:w-72 lg:hover:shadow-2xl lg:hover:shadow-black/40 lg:focus-within:w-72 lg:focus-within:shadow-2xl lg:focus-within:shadow-black/40 motion-reduce:transition-none"
        >
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 flex h-11 w-11 items-center justify-center rounded-xl text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/60 lg:hidden"
            aria-label="Close sidebar"
          >
            <HiXMark className="h-5 w-5" />
          </button>

          <div className="border-b border-zinc-800 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] sm:p-6 lg:p-4 lg:pt-4">
            <Link
              prefetch={false}
              href="/"
              className="mb-4 flex items-center gap-3"
              aria-label="Hack Club Photos home"
            >
              <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg">
                <Image
                  src={logoUrl}
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              </div>
              <div className={compactCopyClasses}>
                <h1 className="text-lg font-bold text-white">Hack Club</h1>
                <p className="text-xs text-zinc-400">Photos</p>
              </div>
            </Link>
            <GlobalSearch />
          </div>

          <nav
            className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 sm:p-4 lg:p-4"
            aria-label="Primary navigation"
          >
            <div className="mb-6 transition-[margin] duration-150 lg:mb-2 lg:group-hover/sidebar:mb-6 lg:group-focus-within/sidebar:mb-6">
              <p className={sectionHeadingClasses}>Main</p>
              {publicNavigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    prefetch={false}
                    key={item.name}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? "bg-red-600 text-white shadow-lg"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className={compactCopyClasses}>{item.name}</span>
                  </Link>
                );
              })}

              {user && (
                <>
                  <Link
                    prefetch={false}
                    href={`/users/${user.handle || user.id}`}
                    aria-current={
                      pathname === `/users/${user.handle || user.id}`
                        ? "page"
                        : undefined
                    }
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                      pathname === `/users/${user.handle || user.id}`
                        ? "bg-red-600 text-white shadow-lg"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    <HiUser className="h-5 w-5 shrink-0" />
                    <span className={compactCopyClasses}>My Profile</span>
                  </Link>
                  <Link
                    prefetch={false}
                    href="/developer"
                    aria-current={
                      pathname === "/developer" ? "page" : undefined
                    }
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                      pathname === "/developer"
                        ? "bg-red-600 text-white shadow-lg"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    <HiCodeBracket className="h-5 w-5 shrink-0" />
                    <span className={compactCopyClasses}>Developer</span>
                  </Link>
                </>
              )}
            </div>

            {(user?.isGlobalAdmin || user?.hasAdminAccess) && (
              <div className="mb-6 transition-[margin] duration-150 lg:mb-2 lg:group-hover/sidebar:mb-6 lg:group-focus-within/sidebar:mb-6">
                <p className={sectionHeadingClasses}>Administration</p>
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
                        prefetch={false}
                        key={item.name}
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                          isActive
                            ? "bg-red-600 text-white shadow-lg"
                            : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        }`}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span className={compactCopyClasses}>{item.name}</span>
                      </Link>
                    );
                  })}
              </div>
            )}
          </nav>

          {user ? (
            <div className="border-t border-zinc-800 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:pb-4">
              <Link
                prefetch={false}
                href={`/users/${user.handle || user.id}`}
                className="group/profile -mx-2 mb-3 flex min-h-12 items-center gap-3 rounded-xl p-2 transition-colors hover:bg-zinc-800/50"
              >
                <UserAvatar user={user} size="md" />
                <div className={`min-w-0 flex-1 ${compactCopyClasses}`}>
                  <p className="truncate text-sm font-medium text-white transition-colors group-hover/profile:text-red-400">
                    {user.name}
                  </p>
                  <p className="truncate text-xs text-zinc-400">{user.email}</p>
                </div>
              </Link>
              <button
                type="button"
                onClick={signOut}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white"
              >
                <HiArrowRightOnRectangle className="h-5 w-5 shrink-0" />
                <span className="lg:hidden lg:group-hover/sidebar:inline lg:group-focus-within/sidebar:inline">
                  Sign Out
                </span>
              </button>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-zinc-800/50 pt-4 lg:hidden lg:group-hover/sidebar:flex lg:group-focus-within/sidebar:flex">
                <Link
                  prefetch={false}
                  href="/privacy"
                  className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  Privacy Policy
                </Link>
                <Link
                  prefetch={false}
                  href="/imprint"
                  className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  Imprint
                </Link>
              </div>
            </div>
          ) : (
            <div className="border-t border-zinc-800 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:pb-4">
              <Link
                prefetch={false}
                href="/auth/signin"
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2.5 text-center text-sm font-medium text-white transition-all hover:bg-red-700"
              >
                <HiArrowLeftOnRectangle className="h-5 w-5 shrink-0" />
                <span className="lg:hidden lg:group-hover/sidebar:inline lg:group-focus-within/sidebar:inline">
                  Sign In
                </span>
              </Link>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-zinc-800/50 pt-4 lg:hidden lg:group-hover/sidebar:flex lg:group-focus-within/sidebar:flex">
                <Link
                  prefetch={false}
                  href="/privacy"
                  className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  Privacy Policy
                </Link>
                <Link
                  prefetch={false}
                  href="/imprint"
                  className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  Imprint
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
