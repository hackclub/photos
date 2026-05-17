import {
  GetObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { getUserContext } from "@/lib/auth-api";
import { db } from "@/lib/db";
import { events, series, users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { S3_BUCKET_NAME, s3Client } from "@/lib/media/s3";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      type: string;
      id: string;
    }>;
  },
) {
  const { type, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const requestRange = req.headers.get("range") ?? undefined;
  if (requestRange && !/^bytes=\d*-\d*(,\d*-\d*)?$/.test(requestRange)) {
    return new NextResponse("Invalid range", { status: 416 });
  }
  let { user } = await getUserContext();

  if (!user) {
    const sessionToken = req.cookies.get("session")?.value;

    if (sessionToken) {
      const sessionUser = await verifySessionToken(sessionToken);
      if (sessionUser) {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, sessionUser.id),
          columns: {
            id: true,
            slackId: true,
            isGlobalAdmin: true,
            isBanned: true,
          },
          with: {
            seriesAdminRoles: {
              columns: { seriesId: true },
            },
            eventAdminRoles: {
              columns: { eventId: true },
            },
          },
        });

        if (dbUser && !dbUser.isBanned) {
          user = {
            id: dbUser.id,
            slackId: dbUser.slackId,
            isGlobalAdmin: dbUser.isGlobalAdmin,
            isBanned: dbUser.isBanned || false,
            seriesAdmins: dbUser.seriesAdminRoles,
            eventAdmins: dbUser.eventAdminRoles,
          };
        }
      }
    }
  }

  try {
    let s3Key: string | null = null;
    let isPublic = false;
    switch (type) {
      case "event-banner": {
        const event = await db.query.events.findFirst({
          where: eq(events.id, id),
          columns: {
            bannerS3Key: true,
          },
        });
        if (!event || !event.bannerS3Key) {
          return new NextResponse("Not Found", { status: 404 });
        }
        s3Key = event.bannerS3Key;
        isPublic = true;
        break;
      }
      case "series-banner": {
        const seriesItem = await db.query.series.findFirst({
          where: eq(series.id, id),
          columns: {
            bannerS3Key: true,
          },
        });
        if (!seriesItem || !seriesItem.bannerS3Key) {
          return new NextResponse("Not Found", { status: 404 });
        }
        s3Key = seriesItem.bannerS3Key;
        isPublic = true;
        break;
      }
      default:
        return new NextResponse("Invalid asset type", { status: 400 });
    }
    if (!s3Key) {
      return new NextResponse("Not Found", { status: 404 });
    }
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Range: requestRange,
      IfNoneMatch: req.headers.get("if-none-match") ?? undefined,
      IfModifiedSince: req.headers.get("if-modified-since")
        ? new Date(req.headers.get("if-modified-since") as string)
        : undefined,
    });
    let s3Response: GetObjectCommandOutput;
    try {
      s3Response = await s3Client.send(command);
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode === 304) {
        return new NextResponse(null, { status: 304 });
      }
      logger.error(`Failed to fetch asset from S3:`, error);
      return new NextResponse("Failed to fetch asset", { status: 502 });
    }
    const headers = new Headers();
    headers.set("X-Content-Type-Options", "nosniff");
    if (s3Response.ContentType) {
      headers.set("Content-Type", s3Response.ContentType);
    }
    if (s3Response.ContentLength) {
      headers.set("Content-Length", String(s3Response.ContentLength));
    }
    if (s3Response.ETag) {
      headers.set("ETag", s3Response.ETag);
    }
    if (s3Response.LastModified) {
      headers.set("Last-Modified", s3Response.LastModified.toUTCString());
    }
    if (s3Response.AcceptRanges) {
      headers.set("Accept-Ranges", s3Response.AcceptRanges);
    }
    if (s3Response.ContentRange) {
      headers.set("Content-Range", s3Response.ContentRange);
    }
    if (isPublic) {
      const cacheControl = "public, max-age=31536000, immutable";
      headers.set("Cache-Control", cacheControl);
      headers.set("CDN-Cache-Control", cacheControl);
      headers.set("Cloudflare-CDN-Cache-Control", cacheControl);
    } else {
      headers.set("Cache-Control", "private, max-age=3600");
    }
    return new NextResponse(s3Response.Body as ReadableStream, {
      status: s3Response.ContentRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    logger.error("Error serving asset:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
