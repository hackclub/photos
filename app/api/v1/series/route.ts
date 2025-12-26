import { desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { unauthorizedResponse, validateApiKey } from "@/lib/auth-api";
import { APP_URL } from "@/lib/constants";
import { db } from "@/lib/db";
import { series } from "@/lib/db/schema";
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
    const publicSeries = await db
      .select({
        id: series.id,
        name: series.name,
        slug: series.slug,
        description: series.description,
        bannerS3Key: series.bannerS3Key,
        createdAt: series.createdAt,
      })
      .from(series)
      .where(eq(series.visibility, "public"))
      .orderBy(desc(series.createdAt))
      .limit(limit)
      .offset(offset);
    const seriesWithUrls = publicSeries.map((s) => {
      const baseUrl = `${APP_URL}/api/v1/download/${s.id}`;
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        bannerUrl: s.bannerS3Key ? `${baseUrl}?type=series` : null,
        createdAt: s.createdAt,
      };
    });
    return Response.json({
      data: seriesWithUrls,
      pagination: {
        page,
        limit,
      },
    });
  } catch (error) {
    console.error("Error fetching series:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
