import { and, desc, eq, like, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { unauthorizedResponse, validateApiKey } from "@/lib/auth-api";
import { APP_URL } from "@/lib/constants";
import { db } from "@/lib/db";
import { events, media } from "@/lib/db/schema";
export async function GET(req: NextRequest) {
  const auth = await validateApiKey();
  if (!auth) {
    return unauthorizedResponse();
  }
  const searchParams = req.nextUrl.searchParams;
  const isRandom = searchParams.get("random") === "true";
  const eventSlug = searchParams.get("event");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limitParam = parseInt(searchParams.get("limit") || "20", 10);
  const countParam = parseInt(searchParams.get("count") || "1", 10);
  const limit = isRandom
    ? Math.min(Math.max(countParam, 1), 100)
    : Math.min(Math.max(limitParam, 1), 100);
  const offset = (page - 1) * limit;
  try {
    const conditions = [
      eq(events.visibility, "public"),
      like(media.mimeType, "video/%"),
    ];
    if (eventSlug) {
      conditions.push(eq(events.slug, eventSlug));
    }
    const baseQuery = db
      .select({
        id: media.id,
        s3Key: media.s3Key,
        thumbnailS3Key: media.thumbnailS3Key,
        width: media.width,
        height: media.height,
        caption: media.caption,
        takenAt: media.takenAt,
        uploadedAt: media.uploadedAt,
        eventId: media.eventId,
        eventName: events.name,
        mimeType: media.mimeType,
      })
      .from(media)
      .innerJoin(events, eq(media.eventId, events.id))
      .where(and(...conditions));
    const videos = await (isRandom
      ? baseQuery.orderBy(sql`RANDOM()`).limit(limit)
      : baseQuery.orderBy(desc(media.uploadedAt)).limit(limit).offset(offset));
    const videosWithUrls = videos.map((video) => {
      const baseUrl = `${APP_URL}/api/v1/download/${video.id}`;
      return {
        id: video.id,
        url: `${baseUrl}?type=media`,
        thumbnailUrl: video.thumbnailS3Key
          ? `${baseUrl}?variant=thumbnail&type=media`
          : null,
        width: video.width,
        height: video.height,
        caption: video.caption,
        takenAt: video.takenAt,
        uploadedAt: video.uploadedAt,
        eventId: video.eventId,
        eventName: video.eventName,
        mimeType: video.mimeType,
      };
    });
    const response: {
      data: typeof videosWithUrls;
      pagination?: {
        page: number;
        limit: number;
      };
      count?: number;
    } = {
      data: videosWithUrls,
    };
    if (!isRandom) {
      response.pagination = {
        page,
        limit,
      };
    } else {
      response.count = videosWithUrls.length;
    }
    return Response.json(response);
  } catch (error) {
    console.error("Error fetching videos:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
