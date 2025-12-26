import type { Metadata } from "next";
import { Suspense } from "react";
import { HiWrenchScrewdriver } from "react-icons/hi2";
import "./globals.css";
import ComingSoon from "@/components/ComingSoon";
import { comingSoon, maintenanceMode } from "@/flags";
import ClientLayout from "./ClientLayout";
export const metadata: Metadata = {
  title: "Hack Club Photos",
  description: "A place for all Hack Club photos and videos from events",
  openGraph: {
    images: ["/api/og"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/api/og"],
  },
};
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isMaintenanceMode = await maintenanceMode();
  const isComingSoon = await comingSoon();
  if (isComingSoon) {
    return <ComingSoon />;
  }
  if (isMaintenanceMode) {
    return (
      <html lang="en" className="dark">
        <body className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          <div className="max-w-2xl w-full text-center px-4">
            <div className="mb-8 flex justify-center">
              <HiWrenchScrewdriver className="w-24 h-24 text-red-600" />
            </div>

            <h1 className="text-5xl md:text-7xl font-bold text-white mb-4">
              Maintenance
            </h1>

            <h2 className="text-2xl font-medium text-zinc-300 mb-8">
              Heidi is cooking sum up!
            </h2>

            <div className="max-w-md mx-auto space-y-4">
              <p className="text-lg text-zinc-400">
                This should not take too long...
              </p>
              <p className="text-base text-zinc-500 italic">
                (Please check back in a bit!)
              </p>
            </div>
          </div>
        </body>
      </html>
    );
  }
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <Suspense fallback={null}>
          <ClientLayout>{children}</ClientLayout>
        </Suspense>
      </body>
    </html>
  );
}
