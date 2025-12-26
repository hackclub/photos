import { count, desc, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  HiCalendar,
  HiCloud,
  HiDocumentDuplicate,
  HiExclamationTriangle,
  HiFolder,
  HiPhoto,
  HiPlus,
  HiServer,
  HiUsers,
} from "react-icons/hi2";
import { getCurrentUser } from "@/app/actions/users";
import VideoIndicator from "@/components/media/VideoIndicator";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { db } from "@/lib/db";
import { events, media, reports, series, users } from "@/lib/db/schema";
import { formatBytes } from "@/lib/format";
import { getUserContext } from "@/lib/policy";
export default async function AdminDashboard() {
  const userResult = await getCurrentUser();
  if (!userResult.success || !userResult.user) {
    redirect("/auth/signin?callbackUrl=/admin");
  }
  const ctx = await getUserContext(userResult.user.id);
  if (!ctx || ctx.isBanned) {
    redirect("/unauthorized");
  }
  if (!ctx.isGlobalAdmin) {
    redirect("/admin/events");
  }
  const [
    storageStats,
    usersCount,
    eventsCount,
    seriesCount,
    pendingReportsCount,
    recentMedia,
  ] = await Promise.all([
    import("@/lib/media/s3").then((m) => m.getStorageStats()),
    db
      .select({ count: count() })
      .from(users)
      .then((res) => res[0].count),
    db
      .select({ count: count() })
      .from(events)
      .then((res) => res[0].count),
    db
      .select({ count: count() })
      .from(series)
      .then((res) => res[0].count),
    db
      .select({ count: count() })
      .from(reports)
      .where(eq(reports.status, "pending"))
      .then((res) => res[0].count),
    db.query.media.findMany({
      orderBy: [desc(media.uploadedAt)],
      limit: 12,
      with: {
        uploadedBy: true,
        event: true,
      },
    }),
  ]);
  const { getMediaProxyUrl } = await import("@/lib/media/s3");
  const mediaWithUrls = recentMedia.map((item) => {
    try {
      const presignedUrl = getMediaProxyUrl(
        item.id,
        item.thumbnailS3Key ? "thumbnail" : "original",
      );
      return { ...item, presignedUrl };
    } catch (error) {
      console.error("Error fetching URL for", item.id, error);
      return { ...item, presignedUrl: null as string | null };
    }
  });
  return (
    <div className="min-h-screen pb-12">
      <AdminPageHeader
        title="Admin Dashboard"
        description="Overview of your instance and quick actions."
      />

      <AdminPageContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <HiUsers className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-500">Total Users</p>
                <h3 className="text-2xl font-bold text-white">
                  {usersCount.toLocaleString()}
                </h3>
              </div>
            </div>
          </div>

          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <HiCalendar className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-500">Total Events</p>
                <h3 className="text-2xl font-bold text-white">
                  {eventsCount.toLocaleString()}
                </h3>
              </div>
            </div>
          </div>

          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <HiFolder className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-500">Total Series</p>
                <h3 className="text-2xl font-bold text-white">
                  {seriesCount.toLocaleString()}
                </h3>
              </div>
            </div>
          </div>

          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <HiCloud className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-500">Storage Used</p>
                <h3 className="text-2xl font-bold text-white">
                  {formatBytes(Number(storageStats?.totalSize || 0))}
                </h3>
              </div>
            </div>
          </div>

          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <HiDocumentDuplicate className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-500">Total Files</p>
                <h3 className="text-2xl font-bold text-white">
                  {storageStats?.totalFiles?.toLocaleString() || 0}
                </h3>
              </div>
            </div>
          </div>

          <Link
            href="/admin/reports"
            className={`p-6 bg-zinc-900 border rounded-xl transition-all hover:border-red-600/50 ${pendingReportsCount > 0 ? "border-red-900/50 bg-red-900/5" : "border-zinc-800"}`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center ${pendingReportsCount > 0 ? "bg-red-500/20" : "bg-zinc-800"}`}
              >
                <HiExclamationTriangle
                  className={`w-6 h-6 ${pendingReportsCount > 0 ? "text-red-400" : "text-zinc-400"}`}
                />
              </div>
              <div>
                <p
                  className={`text-sm ${pendingReportsCount > 0 ? "text-red-300" : "text-zinc-500"}`}
                >
                  Pending Reports
                </p>
                <h3
                  className={`text-2xl font-bold ${pendingReportsCount > 0 ? "text-red-400" : "text-white"}`}
                >
                  {pendingReportsCount.toLocaleString()}
                </h3>
              </div>
            </div>
          </Link>
        </div>

        <div className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/admin/events/new"
              className="group flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-red-600/50 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-red-600/10 flex items-center justify-center group-hover:bg-red-600/20 transition-colors">
                <HiPlus className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-medium text-white group-hover:text-red-400 transition-colors">
                  New Event
                </h3>
              </div>
            </Link>

            <Link
              href="/admin/series/new"
              className="group flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-purple-600/50 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                <HiFolder className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="font-medium text-white group-hover:text-purple-400 transition-colors">
                  New Series
                </h3>
              </div>
            </Link>

            <Link
              href="/admin/users"
              className="group flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-indigo-600/50 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                <HiUsers className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="font-medium text-white group-hover:text-indigo-400 transition-colors">
                  Manage Users
                </h3>
              </div>
            </Link>

            <Link
              href="/admin/storage"
              className="group flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-orange-600/50 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                <HiServer className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 className="font-medium text-white group-hover:text-orange-400 transition-colors">
                  Storage Analytics
                </h3>
              </div>
            </Link>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Recent Uploads</h2>
            <Link
              href="/feed"
              className="text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              View all →
            </Link>
          </div>

          {mediaWithUrls.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {mediaWithUrls.map((item) => {
                const isVideo = item.mimeType.startsWith("video/");
                return (
                  <Link
                    key={item.id}
                    href={`/events/${item.event.slug}`}
                    className="group aspect-square bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 hover:border-red-600/50 transition-all relative"
                  >
                    {item.presignedUrl ? (
                      <>
                        <Image
                          src={item.presignedUrl}
                          alt={item.filename}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                        />
                        {isVideo && <VideoIndicator size="sm" />}
                        <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="absolute bottom-0 left-0 right-0 p-3">
                            <p className="text-xs text-white font-medium truncate">
                              {item.event.name}
                            </p>
                            <p className="text-xs text-zinc-300 truncate">
                              {item.uploadedBy.name}
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <HiPhoto className="w-8 h-8 text-zinc-700" />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 bg-zinc-900 rounded-xl border border-zinc-800">
              <HiPhoto className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400">No uploads yet</p>
            </div>
          )}
        </div>
      </AdminPageContent>
    </div>
  );
}
