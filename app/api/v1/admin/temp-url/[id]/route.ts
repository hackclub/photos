import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { unauthorizedResponse, validateAdminApiKey } from "@/lib/auth-api";
import { db } from "@/lib/db";
import { events, media, series } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { getSignedDownloadUrl } from "@/lib/media/s3";

const MAX_EXPIRES_IN = 60 * 60 * 24 * 7;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateAdminApiKey();
  if (!auth) return unauthorizedResponse();

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const type = body.type ?? "media";
    const variant = body.variant ?? "original";
    const expiresIn = Math.min(
      Math.max(Number(body.expiresIn ?? 3600), 60),
      MAX_EXPIRES_IN,
    );
    let s3Key: string | null = null;

    if (type === "media") {
      const item = await db.query.media.findFirst({ where: eq(media.id, id) });
      if (!item) return Response.json({ error: "Not found" }, { status: 404 });
      if (variant === "thumbnail") s3Key = item.thumbnailS3Key;
      else if (variant === "blurred") s3Key = item.blurredS3Key;
      else s3Key = item.s3Key;
    } else if (type === "event") {
      const event = await db.query.events.findFirst({
        where: eq(events.id, id),
      });
      s3Key = event?.bannerS3Key ?? null;
    } else if (type === "series") {
      const item = await db.query.series.findFirst({
        where: eq(series.id, id),
      });
      s3Key = item?.bannerS3Key ?? null;
    } else {
      return Response.json({ error: "Invalid type" }, { status: 400 });
    }

    if (!s3Key)
      return Response.json({ error: "File not found" }, { status: 404 });

    const url = await getSignedDownloadUrl(s3Key, expiresIn);
    return Response.json({ url, expiresIn, type, variant, s3Key });
  } catch (error) {
    logger.error("Error generating admin temp URL:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
