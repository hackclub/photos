import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HiTag } from "react-icons/hi2";
import { getAllTags } from "@/app/actions/tags";
import type { tags as tagsSchema } from "@/lib/db/schema";
import { getMediaProxyUrl } from "@/lib/media/s3";

type TagWithCount = typeof tagsSchema.$inferSelect & {
  count: number;
  previewMediaId: string | null;
};
export const metadata: Metadata = {
  title: "Tags | Hack Club Photos",
  description: "Browse photos by tags",
  openGraph: {
    images: ["/api/og?type=search"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/api/og?type=search"],
  },
};
const TAG_COLORS: Record<string, string> = {
  blue: "from-blue-500/10 to-blue-900/10 border-blue-500/20 text-blue-400",
  red: "from-red-500/10 to-red-900/10 border-red-600/20 text-red-400",
  green: "from-green-500/10 to-green-900/10 border-green-500/20 text-green-400",
  yellow:
    "from-yellow-500/10 to-yellow-900/10 border-yellow-500/20 text-yellow-400",
  purple:
    "from-purple-500/10 to-purple-900/10 border-purple-500/20 text-purple-400",
  pink: "from-pink-500/10 to-pink-900/10 border-pink-500/20 text-pink-400",
  orange:
    "from-orange-500/10 to-orange-900/10 border-orange-500/20 text-orange-400",
  gray: "from-zinc-500/10 to-zinc-900/10 border-zinc-500/20 text-zinc-400",
};
export default async function TagsPage() {
  const result = await getAllTags(1, 1000, undefined, "count");
  const tags = result.success && result.tags ? result.tags : [];
  const tagsWithPreviews = (tags as TagWithCount[]).map((tag) => {
    let previewUrl = null;
    if (tag.previewMediaId) {
      try {
        previewUrl = getMediaProxyUrl(tag.previewMediaId, "thumbnail");
      } catch (e) {
        console.error("Failed to get preview URL", e);
      }
    }
    return { ...tag, previewUrl };
  });
  return (
    <div className="min-h-screen bg-black">
      <div className="relative bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900 border-b border-zinc-800">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-red-600/10 rounded-2xl border border-red-600/20 backdrop-blur-sm">
              <HiTag className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
              Tags
            </h1>
          </div>
          <p className="text-xl text-zinc-400 max-w-2xl leading-relaxed">
            Explore the collection through tags. Discover photos grouped by
            topics, events, and themes.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {tagsWithPreviews.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {tagsWithPreviews.map((tag) => {
              const colorStyle =
                TAG_COLORS[tag.color || "blue"] || TAG_COLORS.blue;
              const textColorClass =
                colorStyle.split(" ").find((c) => c.startsWith("text-")) ||
                "text-blue-400";
              return (
                <Link
                  key={tag.id}
                  href={`/search?tag=${tag.id}`}
                  className="group relative aspect-4/3 overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-black/50"
                >
                  {tag.previewUrl ? (
                    <>
                      <Image
                        src={tag.previewUrl}
                        alt={tag.name}
                        fill
                        className="object-cover opacity-60 group-hover:opacity-50 transition-opacity duration-500"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent" />
                    </>
                  ) : (
                    <div
                      className={`absolute inset-0 bg-linear-to-br ${colorStyle} opacity-30`}
                    />
                  )}

                  <div className="absolute inset-0 p-5 flex flex-col justify-end">
                    <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold text-white text-2xl wrap-break-word leading-tight shadow-black drop-shadow-lg">
                          <span className={`mr-0.5 ${textColorClass}`}>#</span>
                          {tag.name}
                        </h3>
                      </div>
                      <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75">
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/10 text-white backdrop-blur-md border border-white/10">
                          {tag.count} {tag.count === 1 ? "photo" : "photos"}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-32">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-zinc-800">
              <HiTag className="w-10 h-10 text-zinc-700" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              No tags found
            </h3>
            <p className="text-zinc-500 text-lg max-w-md mx-auto">
              Tags will appear here once photos are uploaded and tagged.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
