import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getClientIpFromHeaders, getUserContext } from "@/lib/auth-api";
import { db } from "@/lib/db";
import { events, media, series } from "@/lib/db/schema";
import { can } from "@/lib/policy";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const ip = getClientIpFromHeaders(req.headers, "anonymous");
  const rateLimitResult = await rateLimit(`view_v1:${ip}`, {
    limit: 200,
    window: 3600,
    failOpen: false,
  });

  if (!rateLimitResult.success) {
    return new Response("Rate limit exceeded", { status: 429 });
  }

  const { id } = await params;
  const searchParams = req.nextUrl.searchParams;
  const variant = searchParams.get("variant") || "display";
  const type = searchParams.get("type") || "media";
  try {
    const { user } = await getUserContext();
    let s3Key: string | null = null;
    let _mimeType: string | null = null;
    if (type === "media") {
      const item = await db.query.media.findFirst({
        where: eq(media.id, id),
        with: {
          event: true,
        },
      });
      if (!item) {
        return new Response("Not Found", { status: 404 });
      }
      if (!(await can(user, "view", "media", item))) {
        return new Response("Forbidden", { status: 403 });
      }
      _mimeType = item.mimeType;
      if (variant === "thumbnail" && item.thumbnailS3Key) {
        s3Key = item.thumbnailS3Key;
      } else if (variant === "original") {
        s3Key = item.s3Key;
      } else {
        s3Key = item.s3Key;
      }
    } else if (type === "event") {
      const event = await db.query.events.findFirst({
        where: eq(events.id, id),
      });
      if (!event || !event.bannerS3Key) {
        return new Response("Not Found", { status: 404 });
      }
      if (!(await can(user, "view", "event", event))) {
        return new Response("Forbidden", { status: 403 });
      }
      s3Key = event.bannerS3Key;
    } else if (type === "series") {
      const seriesItem = await db.query.series.findFirst({
        where: eq(series.id, id),
      });
      if (!seriesItem || !seriesItem.bannerS3Key) {
        return new Response("Not Found", { status: 404 });
      }
      if (!(await can(user, "view", "series", seriesItem))) {
        return new Response("Forbidden", { status: 403 });
      }
      s3Key = seriesItem.bannerS3Key;
    } else {
      return new Response("Invalid type", { status: 400 });
    }
    if (!s3Key) {
      return new Response("Not Found", { status: 404 });
    }
    if (type === "media") {
      const proxyUrl = new URL(`/media/${id}`, req.url);
      if (variant) {
        proxyUrl.searchParams.set("variant", variant);
      }
      return redirect(proxyUrl.toString());
    }
    if (type === "event") {
      return redirect(`/assets/event-banner/${id}`);
    } else if (type === "series") {
      return redirect(`/assets/series-banner/${id}`);
    }
    return new Response("Not Found", { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error;
    }
    console.error("Error in view redirect:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
