import { desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { unauthorizedResponse, validateApiKey } from "@/lib/auth-api";
import { APP_URL } from "@/lib/constants";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
export async function GET(req: NextRequest) {
  const auth = await validateApiKey();
  if (!auth) {
    return unauthorizedResponse();
  }
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
  const offset = (page - 1) * limit;
  try {
    const publicEvents = await db
      .select({
        id: events.id,
        name: events.name,
        slug: events.slug,
        description: events.description,
        bannerS3Key: events.bannerS3Key,
        eventDate: events.eventDate,
        location: events.location,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(eq(events.visibility, "public"))
      .orderBy(desc(events.eventDate))
      .limit(limit)
      .offset(offset);
    const eventsWithUrls = publicEvents.map((event) => {
      const baseUrl = `${APP_URL}/api/v1/download/${event.id}`;
      return {
        id: event.id,
        name: event.name,
        slug: event.slug,
        description: event.description,
        bannerUrl: event.bannerS3Key ? `${baseUrl}?type=event` : null,
        eventDate: event.eventDate,
        location: event.location,
        createdAt: event.createdAt,
      };
    });
    return Response.json({
      data: eventsWithUrls,
      pagination: {
        page,
        limit,
      },
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
