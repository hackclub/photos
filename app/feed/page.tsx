import { Suspense } from "react";
import { getGlobalFeed } from "@/app/actions/feed";
import ActivityFeed from "@/components/feed/ActivityFeed";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
export const metadata = {
  title: "Activity Feed | Hack Club Photos",
  description: "See the latest photos from Hack Club events",
  openGraph: {
    images: ["/api/og?type=feed"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/api/og?type=feed"],
  },
};
export default function FeedPage() {
  return (
    <div className="min-h-screen text-white">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Feed</h1>
          <p className="text-zinc-400">Latest photos from Hack Club events</p>
        </div>

        <Suspense fallback={<LoadingSpinner />}>
          <ActivityFeed
            fetchData={getGlobalFeed}
            type="global"
            pollInterval={30000}
          />
        </Suspense>
      </div>
    </div>
  );
}
