import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
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
import { db } from "@/lib/db";
import { events, series, tags, users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { getAssetProxyUrl, getMediaProxyUrl } from "@/lib/media/s3";
import { getSlackAvatarUrl, getUserDisplayName } from "@/lib/user-display";

export const runtime = "nodejs";

const OG_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://photos.hackclub.com";
const PUBLIC_IMAGE_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
  "CDN-Cache-Control":
    "public, max-age=31536000, stale-while-revalidate=604800",
  "Cloudflare-CDN-Cache-Control":
    "public, max-age=31536000, stale-while-revalidate=604800",
};

function absoluteUrl(path: string) {
  return new URL(path, OG_BASE_URL).toString();
}

function baseCard(
  title: string,
  description?: string,
  icon?: React.ReactNode,
  label?: string,
  image?: string,
) {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#09090b",
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {image ? (
        <img
          src={image}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.5,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: image
            ? "linear-gradient(to bottom, rgba(9,9,11,0.15) 0%, rgba(9,9,11,0.9) 100%)"
            : "linear-gradient(180deg, rgba(220, 38, 38, 0.15) 0%, transparent 100%)",
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 80px",
          textAlign: "center",
          position: "relative",
          zIndex: 10,
        }}
      >
        {icon ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 100,
              height: 100,
              borderRadius: 24,
              background: "rgba(220, 38, 38, 0.2)",
              border: "1px solid rgba(220, 38, 38, 0.3)",
              marginBottom: 32,
              color: "#f87171",
            }}
          >
            {icon}
          </div>
        ) : null}
        {label ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 24px",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: 100,
              border: "1px solid rgba(255, 255, 255, 0.1)",
              marginBottom: 24,
            }}
          >
            <span
              style={{
                color: "#e4e4e7",
                fontSize: 20,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {label}
            </span>
          </div>
        ) : null}
        <h1
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: "white",
            margin: "0 0 24px 0",
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            maxWidth: 1050,
            wordBreak: "break-word",
          }}
        >
          {title}
        </h1>
        {description ? (
          <p
            style={{
              fontSize: 36,
              color: "#d4d4d8",
              margin: 0,
              lineHeight: 1.5,
              maxWidth: 1000,
              wordBreak: "break-word",
            }}
          >
            {description}
          </p>
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 80,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ color: "#71717a", fontSize: 24, fontWeight: 500 }}>
          photos.hackclub.com
        </span>
      </div>
      <img
        src="https://assets.hackclub.com/icon-rounded.png"
        alt="Hack Club"
        style={{
          position: "absolute",
          bottom: 40,
          right: 80,
          width: 80,
          height: 80,
          borderRadius: 16,
        }}
      />
    </div>,
    { width: 1200, height: 630, headers: PUBLIC_IMAGE_CACHE_HEADERS },
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const ogIndex = pathParts.indexOf("og");
    const routeType = ogIndex >= 0 ? pathParts[ogIndex + 1] : undefined;
    const routeId = ogIndex >= 0 ? pathParts[ogIndex + 2] : undefined;
    const type = routeType?.endsWith(".png")
      ? routeType.replace(/\.png$/, "")
      : routeType || url.searchParams.get("type");
    const rawId = routeId || url.searchParams.get("id");
    const id = rawId?.replace(/\.png$/, "");
    if (!type) {
      return baseCard(
        "Hack Club Photos",
        "A place for all Hack Club photos and videos from events",
        <HiCamera style={{ width: 64, height: 64 }} />,
      );
    }
    if (type === "event" && id) {
      const event = await db.query.events.findFirst({
        where: eq(events.slug, id),
      });
      if (!event) return baseCard("Hack Club Photos", "Event not found");
      const bannerUrl = event.bannerS3Key
        ? absoluteUrl(getAssetProxyUrl("event-banner", event.id))
        : undefined;
      return baseCard(
        event.name,
        event.description || `Photos from ${event.name}`,
        <HiCalendar style={{ width: 64, height: 64 }} />,
        "Event",
        bannerUrl,
      );
    }
    if (type === "series" && id) {
      const seriesData = await db.query.series.findFirst({
        where: eq(series.slug, id),
      });
      if (!seriesData) return baseCard("Hack Club Photos", "Series not found");
      const bannerUrl = seriesData.bannerS3Key
        ? absoluteUrl(getAssetProxyUrl("series-banner", seriesData.id))
        : undefined;
      return baseCard(
        seriesData.name,
        seriesData.description || `Photo series: ${seriesData.name}`,
        <HiRectangleStack style={{ width: 64, height: 64 }} />,
        "Series",
        bannerUrl,
      );
    }
    if (type === "user" && id) {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        );
      const user = await db.query.users.findFirst({
        where: isUuid ? eq(users.id, id) : eq(users.handle, id),
      });
      if (!user) return baseCard("Hack Club Photos", "User not found");
      const avatarUrl = getSlackAvatarUrl(user.slackId);
      const displayName = getUserDisplayName(user);
      return baseCard(
        displayName,
        user.bio || `@${user.handle || "user"} on Hack Club Photos`,
        avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: 24,
            }}
          />
        ) : (
          <HiUser style={{ width: 64, height: 64 }} />
        ),
        "User",
      );
    }
    if (type === "tag" && id) {
      const tag = await db.query.tags.findFirst({
        where: eq(tags.id, id),
        with: {
          media: {
            limit: 1,
            with: {
              media: true,
            },
          },
        },
      });
      if (!tag) return baseCard("Hack Club Photos", "Tag not found");
      const mediaItem = tag.media[0];
      const previewUrl = mediaItem?.media.thumbnailS3Key
        ? absoluteUrl(getMediaProxyUrl(mediaItem.media.id, "thumbnail"))
        : undefined;
      return baseCard(
        `#${tag.name}`,
        `Browse photos tagged with #${tag.name}`,
        <HiTag style={{ width: 64, height: 64 }} />,
        "Tag",
        previewUrl,
      );
    }
    if (type === "map") {
      return baseCard(
        "Photo Map",
        "Explore Hack Club photos around the world",
        <HiMap style={{ width: 64, height: 64 }} />,
        "Map",
      );
    }
    if (type === "feed") {
      return baseCard(
        "Live Feed",
        "Real-time stream of photos from Hack Club events",
        <HiRss style={{ width: 64, height: 64 }} />,
        "Feed",
      );
    }
    if (type === "developer") {
      return baseCard(
        "Developer API",
        "Build with the Hack Club Photos API",
        <HiCodeBracket style={{ width: 64, height: 64 }} />,
        "Developer",
      );
    }
    if (type === "search") {
      return baseCard(
        "Search",
        "Find photos, events, and people",
        <HiMagnifyingGlass style={{ width: 64, height: 64 }} />,
        "Search",
      );
    }
    return baseCard("Hack Club Photos", "Invalid type");
  } catch (e) {
    logger.error(e);
    return baseCard("Hack Club Photos", "Failed to generate image");
  }
}
