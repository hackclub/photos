"use client";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { HiBars3 } from "react-icons/hi2";
import Sidebar from "@/components/layout/Sidebar";
import GlobalUploader from "@/components/media/GlobalUploader";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { UploadProvider } from "@/components/providers/UploadProvider";
import type { SessionUser } from "@/lib/auth";

export default function ClientLayout({
  children,
  initialSession,
}: {
  children: React.ReactNode;
  initialSession?: SessionUser | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const handleCloseSidebar = useCallback(() => setSidebarOpen(false), []);
  const pathname = usePathname();
  const isSignMode = pathname?.startsWith("/sign");
  return (
    <AuthProvider initialSession={initialSession}>
      <UploadProvider>
        <div className="flex min-h-dvh overflow-x-clip">
          {!isSignMode && (
            <Sidebar isOpen={sidebarOpen} onClose={handleCloseSidebar} />
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {!isSignMode && (
              <div className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/95 px-3 py-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)] backdrop-blur lg:hidden">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/60"
                  aria-label="Open sidebar"
                >
                  <HiBars3 className="w-6 h-6" />
                </button>

                <h1 className="truncate px-3 text-base font-bold text-white">
                  Hack Club Photos
                </h1>

                <div className="w-10" />
              </div>
            )}

            <main className="flex-1">{children}</main>
          </div>
        </div>
        {!isSignMode && <GlobalUploader />}
      </UploadProvider>
    </AuthProvider>
  );
}
