import { eq } from "drizzle-orm";
import {
  HiCalendar,
  HiCamera,
  HiCodeBracket,
  HiMagnifyingGlass,
  HiMap,
  HiRectangleStack,
  HiRss,
  HiTag,
  HiUser,
} from "react-icons/hi2";
import { APP_URL } from "@/lib/constants";
import { db } from "@/lib/db";
import { events, series, tags, users } from "@/lib/db/schema";
import { getAssetProxyUrl, getMediaProxyUrl } from "@/lib/media/s3";
import { generateOgImage } from "@/lib/og";
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");
    if (!type) {
      return generateOgImage({
        title: "Hack Club Photos",
        description: "A place for all Hack Club photos and videos from events",
        icon: <HiCamera style={{ width: 64, height: 64 }} />,
      });
    }
    if (type === "event" && id) {
      const event = await db.query.events.findFirst({
        where: eq(events.slug, id),
      });
      if (!event) return errorImage("Event not found");
      let bannerUrl: string | undefined;
      if (event.bannerS3Key) {
        bannerUrl = `${APP_URL}${getAssetProxyUrl("event-banner", event.id)}`;
      }
      return generateOgImage({
        title: event.name,
        description: event.description || `Photos from ${event.name}`,
        image: bannerUrl,
        icon: <HiCalendar style={{ width: 64, height: 64 }} />,
        label: "Event",
      });
    }
    if (type === "series" && id) {
      const seriesData = await db.query.series.findFirst({
        where: eq(series.slug, id),
      });
      if (!seriesData) return errorImage("Series not found");
      let bannerUrl: string | undefined;
      if (seriesData.bannerS3Key) {
        bannerUrl = `${APP_URL}${getAssetProxyUrl("series-banner", seriesData.id)}`;
      }
      return generateOgImage({
        title: seriesData.name,
        description:
          seriesData.description || `Photo series: ${seriesData.name}`,
        image: bannerUrl,
        icon: <HiRectangleStack style={{ width: 64, height: 64 }} />,
        label: "Series",
      });
    }
    if (type === "user" && id) {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        );
      const user = await db.query.users.findFirst({
        where: isUuid ? eq(users.id, id) : eq(users.handle, id),
      });
      if (!user) return errorImage("User not found");
      let avatarUrl: string | undefined;
      if (user.avatarS3Key) {
        avatarUrl = `${APP_URL}${getAssetProxyUrl("avatar", user.id)}`;
      }
      return generateOgImage({
        title: user.name,
        description:
          user.bio || `@${user.handle || "user"} on Hack Club Photos`,
        image: undefined,
        icon: avatarUrl ? (
          <img
            src={avatarUrl}
            alt={user.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "24px",
            }}
          />
        ) : (
          <HiUser style={{ width: 64, height: 64 }} />
        ),
        label: "User",
      });
    }
    if (type === "tag" && id) {
      const tag = await db.query.tags.findFirst({
        where: eq(tags.id, id),
        with: {
          media: {
            limit: 1,
            with: {
              media: {
                with: {
                  event: true,
                },
              },
            },
          },
        },
      });
      if (!tag) return errorImage("Tag not found");
      let previewUrl: string | undefined;
      const mediaItem = tag.media[0];
      if (mediaItem?.media.thumbnailS3Key) {
        previewUrl = `${APP_URL}${getMediaProxyUrl(
          mediaItem.media.id,
          "thumbnail",
        )}`;
      }
      return generateOgImage({
        title: `#${tag.name}`,
        description: `Browse photos tagged with #${tag.name}`,
        image: previewUrl,
        icon: <HiTag style={{ width: 64, height: 64 }} />,
        label: "Tag",
      });
    }
    if (type === "map") {
      return generateOgImage({
        title: "Photo Map",
        description: "Explore Hack Club photos around the world",
        icon: <HiMap style={{ width: 64, height: 64 }} />,
        label: "Map",
      });
    }
    if (type === "feed") {
      return generateOgImage({
        title: "Live Feed",
        description: "Real-time stream of photos from Hack Club events",
        icon: <HiRss style={{ width: 64, height: 64 }} />,
        label: "Feed",
      });
    }
    if (type === "developer") {
      return generateOgImage({
        title: "Developer API",
        description: "Build with the Hack Club Photos API",
        icon: <HiCodeBracket style={{ width: 64, height: 64 }} />,
        label: "Developer",
      });
    }
    if (type === "search") {
      return generateOgImage({
        title: "Search",
        description: "Find photos, events, and people",
        icon: <HiMagnifyingGlass style={{ width: 64, height: 64 }} />,
        label: "Search",
      });
    }
    return errorImage("Invalid type");
  } catch (e) {
    console.error(e);
    return errorImage("Failed to generate image");
  }
}
function errorImage(message: string) {
  return generateOgImage({
    title: "Hack Club Photos",
    description: message,
  });
}
