import { Anton } from "next/font/google";
import Link from "next/link";
import {
  HiArchiveBox,
  HiPhoto,
  HiSparkles,
  HiUserGroup,
} from "react-icons/hi2";
import { twMerge } from "tailwind-merge";
import LandingHero from "@/components/home/LandingHero";
import type { events } from "@/lib/db/schema";

const heroFont = Anton({
  subsets: ["latin"],
  weight: "400",
});
type Event = typeof events.$inferSelect;
interface LandingPageProps {
  recentEvents: (Event & {
    series: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      createdAt: Date;
      updatedAt: Date;
      createdById: string;
      bannerS3Key: string | null;
    } | null;
  })[];
  eventStats: Map<
    string,
    {
      mediaCount: number;
      participantCount: number;
    }
  >;
  eventBannerUrls: Map<string, string>;
  heroImages: string[];
}
export default function LandingPage({
  recentEvents,
  eventStats,
  eventBannerUrls,
  heroImages,
}: LandingPageProps) {
  const marqueeImages = [...heroImages, ...heroImages].slice(0, 20);
  return (
    <div className="min-h-screen bg-black text-white selection:bg-red-600 selection:text-white">
      <LandingHero
        title={
          <>
            Hack Club
            <br />
            <span className="text-red-600">Photos</span>
          </>
        }
        subtitle="All of the photos from all of Hack Club, centralized."
        images={heroImages}
        actions={
          <>
            <Link
              href="/auth/signin"
              className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all text-center shadow-[0_0_30px_-5px_rgba(220,38,38,0.5)] hover:shadow-[0_0_50px_-10px_rgba(220,38,38,0.7)] hover:scale-105"
            >
              Login
            </Link>
            <Link
              href="/events"
              className="px-8 py-4 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all border border-zinc-800 text-center hover:scale-105"
            >
              Explore Gallery
            </Link>
          </>
        }
      />

      <div className="py-24 border-t border-zinc-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-950 to-black" />

        <div className="relative z-10 mb-16 text-center px-4">
          <h2
            className={twMerge(
              "text-4xl md:text-6xl font-black uppercase tracking-tight mb-4",
              heroFont.className,
            )}
          >
            Captured by the{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-700">
              Community
            </span>
          </h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Thousands of photos, captured by Hack Clubbers from places all
            around the world.
          </p>
        </div>

        <div className="relative w-full -rotate-1 scale-105 py-12 bg-zinc-950/50 border-y border-zinc-900/50 backdrop-blur-sm">
          <div
            className="flex gap-8 animate-scroll-left w-max hover:[animation-play-state:paused] px-4"
            style={{ animationDuration: "120s" }}
          >
            {marqueeImages.map((src, i) => {
              const rotation = ((i % 5) - 2) * 2;
              const translateY = ((i % 3) - 1) * 10;
              return (
                <div
                  key={i}
                  className="relative w-[300px] aspect-[4/3] rounded-lg overflow-hidden shadow-2xl group flex-shrink-0 transition-all duration-500 ease-out hover:z-10 hover:scale-110 hover:rotate-0 hover:translate-y-0"
                  style={{
                    transform: `rotate(${rotation}deg) translateY(${translateY}px)`,
                  }}
                >
                  <img
                    src={src}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 grayscale group-hover:grayscale-0"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-lg" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="py-24 bg-zinc-950 border-t border-zinc-900">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            <div className="space-y-4">
              <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 mb-6">
                <HiArchiveBox className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-white">
                No more lost Albums.
              </h3>
              <p className="text-zinc-400 leading-relaxed text-lg">
                Stop digging through Slack history for that one Google Photos
                link. Every event, every photo, all here.
              </p>
            </div>

            <div className="space-y-4">
              <div className="w-14 h-14 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500 mb-6">
                <HiSparkles className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-white">
                Full Quality, Always.
              </h3>
              <p className="text-zinc-400 leading-relaxed text-lg">
                We store the originals. Download the raw files whenever you need
                them.
              </p>
            </div>

            <div className="space-y-4">
              <div className="w-14 h-14 bg-yellow-500/10 rounded-2xl flex items-center justify-center text-yellow-500 mb-6">
                <HiUserGroup className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-white">
                Built for the Community.
              </h3>
              <p className="text-zinc-400 leading-relaxed text-lg">
                Tag people, like photos, tag them, comment and use the API to
                integrate this into your projects.
              </p>
            </div>
          </div>
        </div>
      </div>

      {recentEvents.length > 0 && (
        <div className="py-24 border-t border-zinc-900 bg-zinc-950">
          <div className="container mx-auto px-4 sm:px-8">
            <div className="flex flex-col md:flex-row items-end justify-between gap-6 mb-12">
              <div>
                <h2
                  className={twMerge(
                    "text-4xl md:text-6xl font-black uppercase tracking-tight mb-2",
                    heroFont.className,
                  )}
                >
                  Latest <span className="text-white">Albums</span>
                </h2>
                <p className="text-zinc-400 text-lg">Public event albums!</p>
              </div>

              <Link
                href="/events"
                className="group flex items-center gap-2 text-zinc-400 hover:text-white transition-colors font-medium"
              >
                View all events
                <span className="group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </Link>
            </div>

            <div className="relative w-full overflow-hidden py-12">
              <div
                className="flex gap-8 animate-scroll-right w-max hover:[animation-play-state:paused] px-4"
                style={{ animationDuration: "160s" }}
              >
                {[...recentEvents, ...recentEvents].map((event, i) => {
                  const stats = eventStats.get(event.id) || {
                    mediaCount: 0,
                    participantCount: 0,
                  };
                  const bannerUrl = eventBannerUrls.get(event.id);
                  const rotation = ((i % 7) - 3) * 1.5;
                  const translateY = ((i % 5) - 2) * 15;
                  return (
                    <Link
                      key={`${event.id}-${i}`}
                      href={`/events/${event.slug}`}
                      className="group relative w-[450px] aspect-video overflow-hidden rounded-2xl bg-zinc-900 block flex-shrink-0 border border-zinc-800 transition-all duration-500 ease-out hover:z-10 hover:scale-110 hover:rotate-0 hover:translate-y-0 hover:shadow-2xl hover:border-red-500/50"
                      style={{
                        transform: `rotate(${rotation}deg) translateY(${translateY}px)`,
                      }}
                    >
                      {bannerUrl ? (
                        <img
                          src={bannerUrl}
                          alt={event.name}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                          <span className="text-zinc-800 font-black text-6xl select-none">
                            {event.name[0]}
                          </span>
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-80 transition-opacity duration-500" />

                      <div className="absolute inset-0 p-6 flex flex-col justify-end">
                        <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                          <div className="flex items-center justify-between mb-2">
                            {event.series ? (
                              <span className="inline-block px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase text-white/90 bg-red-600 rounded-full shadow-lg">
                                {event.series.name}
                              </span>
                            ) : (
                              <div />
                            )}

                            {event.eventDate && (
                              <span className="text-xs font-medium text-zinc-300 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-md border border-white/10">
                                {new Date(event.eventDate).toLocaleDateString(
                                  undefined,
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )}
                              </span>
                            )}
                          </div>

                          <h3 className="text-2xl font-bold text-white mb-2 leading-tight drop-shadow-lg line-clamp-1 group-hover:text-red-400 transition-colors">
                            {event.name}
                          </h3>

                          <div className="flex items-center gap-4 text-xs text-zinc-400 font-medium">
                            <div className="flex items-center gap-1.5">
                              <HiPhoto className="w-3.5 h-3.5" />
                              <span>{stats.mediaCount} photos</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <HiUserGroup className="w-3.5 h-3.5" />
                              <span>{stats.participantCount} participants</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="py-32 border-t border-zinc-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-black to-black" />
        <div className="relative z-10 container mx-auto px-4 text-center">
          <h2
            className={twMerge(
              "text-5xl md:text-7xl font-black uppercase tracking-tight mb-8",
              heroFont.className,
            )}
          >
            Ready to <span className="text-red-600">Share?</span>
          </h2>
          <Link
            href="/auth/signin"
            className="inline-block px-12 py-5 bg-white text-black hover:bg-zinc-200 font-black text-xl rounded-full transition-all hover:scale-105 hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]"
          >
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}
