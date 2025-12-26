"use client";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { HiBars3 } from "react-icons/hi2";
import Sidebar from "@/components/layout/Sidebar";
import GlobalUploader from "@/components/media/GlobalUploader";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { UploadProvider } from "@/components/providers/UploadProvider";
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const handleCloseSidebar = useCallback(() => setSidebarOpen(false), []);
  const pathname = usePathname();
  const isSignMode = pathname?.startsWith("/sign");
  return (
    <AuthProvider>
      <UploadProvider>
        <div className="flex min-h-screen">
          {!isSignMode && (
            <Sidebar isOpen={sidebarOpen} onClose={handleCloseSidebar} />
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {!isSignMode && (
              <div className="lg:hidden bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
                  aria-label="Open sidebar"
                >
                  <HiBars3 className="w-6 h-6" />
                </button>

                <h1 className="text-lg font-bold text-white">
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
