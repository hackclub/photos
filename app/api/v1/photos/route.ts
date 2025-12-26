import { and, desc, eq, like, not, sql } from "drizzle-orm";
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
      not(like(media.mimeType, "video/%")),
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
    const photos = await (isRandom
      ? baseQuery.orderBy(sql`RANDOM()`).limit(limit)
      : baseQuery.orderBy(desc(media.uploadedAt)).limit(limit).offset(offset));
    const photosWithUrls = photos.map((photo) => {
      const baseUrl = `${APP_URL}/api/v1/download/${photo.id}`;
      return {
        id: photo.id,
        url: `${baseUrl}?type=media`,
        thumbnailUrl: photo.thumbnailS3Key
          ? `${baseUrl}?variant=thumbnail&type=media`
          : `${baseUrl}?type=media`,
        width: photo.width,
        height: photo.height,
        caption: photo.caption,
        takenAt: photo.takenAt,
        uploadedAt: photo.uploadedAt,
        eventId: photo.eventId,
        eventName: photo.eventName,
        mimeType: photo.mimeType,
      };
    });
    if (!isRandom) {
      return Response.json({
        data: photosWithUrls,
        pagination: {
          page,
          limit,
        },
      });
    } else {
      return Response.json({
        data: photosWithUrls,
        count: photosWithUrls.length,
      });
    }
  } catch (error) {
    console.error("Error fetching photos:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
