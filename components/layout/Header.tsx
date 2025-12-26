"use client";
import Link from "next/link";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import UserAvatar from "@/components/ui/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
export default function Header() {
  const { user, loading, signOut } = useAuth();
  return (
    <header className="bg-zinc-900 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link
              href="/"
              className="text-xl font-bold text-white hover:text-red-400 transition-colors"
            >
              Hack Club Photos
            </Link>
          </div>

          <nav className="flex items-center space-x-4">
            {loading ? (
              <LoadingSpinner size="sm" />
            ) : user ? (
              <>
                <Link
                  href="/events"
                  className="text-zinc-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Events
                </Link>
                <Link
                  href="/series"
                  className="text-zinc-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Series
                </Link>
                <Link
                  href={`/users/${user.handle || user.id}`}
                  className="flex items-center gap-2 text-zinc-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <UserAvatar user={user} size="sm" />
                  <span>{user.name}</span>
                </Link>
                {(user.isGlobalAdmin || user.hasAdminAccess) && (
                  <Link
                    href="/admin"
                    className="text-red-400 hover:text-red-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Admin
                  </Link>
                )}
                <button
                  type="button"
                  onClick={signOut}
                  className="text-zinc-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/auth/signin"
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Sign In
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
