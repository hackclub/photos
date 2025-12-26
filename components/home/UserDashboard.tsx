import Link from "next/link";
import { HiArrowRight, HiCalendar, HiMapPin, HiPhoto } from "react-icons/hi2";
import { PiHandWavingDuotone } from "react-icons/pi";
import EventCard from "@/components/events/EventCard";
import Hero from "@/components/ui/Hero";
import type { events } from "@/lib/db/schema";

type Event = typeof events.$inferSelect;
interface UserDashboardProps {
  session: {
    id: string;
    name: string;
    email: string;
    isGlobalAdmin: boolean;
  };
  userParticipations: {
    event: Event & {
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
    };
  }[];
  eventStats: Map<
    string,
    {
      mediaCount: number;
      participantCount: number;
    }
  >;
  eventBannerUrls: Map<string, string>;
  userPhotoCount: number;
  eventsJoinedCount: number;
  heroImages: string[];
}
export default function UserDashboard({
  session,
  userParticipations,
  eventStats,
  eventBannerUrls,
  userPhotoCount,
  eventsJoinedCount,
  heroImages,
}: UserDashboardProps) {
  return (
    <div className="min-h-screen">
      <Hero
        title={
          <span className="flex items-center justify-center gap-3">
            <PiHandWavingDuotone className="text-white" />
            <span>Welcome back, {session.name.split(" ")[0]}!</span>
          </span>
        }
        subtitle={
          eventsJoinedCount > 0
            ? `You're part of ${eventsJoinedCount} ${eventsJoinedCount === 1 ? "event" : "events"} with ${userPhotoCount} ${userPhotoCount === 1 ? "photo" : "photos"} uploaded`
            : "Start by joining an event to upload and share photos"
        }
        images={heroImages}
        actions={
          <>
            <Link
              href="/events"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:scale-105"
            >
              <HiCalendar className="w-5 h-5" />
              <span>Browse Events</span>
            </Link>
            <Link
              href="/my-photos"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-all border border-zinc-700 hover:scale-105"
            >
              <HiPhoto className="w-5 h-5" />
              <span>My Photos</span>
            </Link>
            <Link
              href="/map"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-all border border-zinc-700 hover:scale-105"
            >
              <HiMapPin className="w-5 h-5" />
              <span>Photo Map</span>
            </Link>
          </>
        }
      />

      <div className="px-4 sm:px-8 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Your Events
              </h2>
              <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                Events you've joined and contributed to
              </p>
            </div>
            <Link
              href="/events"
              className="inline-flex items-center gap-2 text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
            >
              <span>Browse all events</span>
              <HiArrowRight className="w-5 h-5" />
            </Link>
          </div>

          {userParticipations.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {userParticipations.map((participation) => {
                const event = participation.event;
                const stats = eventStats.get(event.id) || {
                  mediaCount: 0,
                  participantCount: 0,
                };
                const bannerUrl = eventBannerUrls.get(event.id);
                return (
                  <EventCard
                    key={event.id}
                    event={{
                      ...event,
                      bannerUrl: bannerUrl,
                      mediaCount: stats.mediaCount,
                      participantCount: stats.participantCount,
                    }}
                    showVisibilityBadge={true}
                    showStats={true}
                    showSeries={true}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20 bg-zinc-900 rounded-xl border border-zinc-800">
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <HiCalendar className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                No events joined yet
              </h3>
              <p className="text-zinc-400 mb-6 max-w-md mx-auto">
                Browse events and join ones you'd attended to start uploading
              </p>
              <Link
                href="/events"
                className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all"
              >
                <HiCalendar className="w-5 h-5" />
                Browse Events
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
