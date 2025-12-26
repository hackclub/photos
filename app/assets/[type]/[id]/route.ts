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
import { s3Client } from "@/lib/media/s3";
import { can } from "@/lib/policy";

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
            isGlobalAdmin: dbUser.isGlobalAdmin,
            isBanned: dbUser.isBanned || false,
            seriesAdmins: dbUser.seriesAdminRoles,
            eventAdmins: dbUser.eventAdminRoles,
          };
        } else {
          console.log(
            "Asset Route: User found in token but not in DB or banned",
            { userId: sessionUser.id },
          );
        }
      } else {
        console.log("Asset Route: Invalid session token");
      }
    } else {
      console.log("Asset Route: No session cookie found in request", {
        cookies: req.cookies.getAll().map((c) => c.name),
        headers: Object.fromEntries(req.headers.entries()),
      });
    }
  }

  try {
    let s3Key: string | null = null;
    let isPublic = false;
    switch (type) {
      case "avatar": {
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          );
        if (isUuid) {
          const userRecord = await db.query.users.findFirst({
            where: eq(users.id, id),
            columns: { avatarS3Key: true },
          });
          if (!userRecord || !userRecord.avatarS3Key) {
            return new NextResponse("Not Found", { status: 404 });
          }
          s3Key = userRecord.avatarS3Key;
          isPublic = true;
        } else {
          s3Key = `users/onboarding/${id}/avatar.jpg`;
          isPublic = true;
        }
        break;
      }
      case "event-banner": {
        const event = await db.query.events.findFirst({
          where: eq(events.id, id),
          columns: {
            id: true,
            bannerS3Key: true,
            visibility: true,
            seriesId: true,
            createdById: true,
          },
        });
        if (!event || !event.bannerS3Key) {
          return new NextResponse("Not Found", { status: 404 });
        }
        const canView = await can(user, "view", "event", event);
        if (canView) {
          s3Key = event.bannerS3Key;
          isPublic = event.visibility === "public";
        } else {
          console.log("Forbidden access to event banner", {
            userId: user?.id,
            eventId: id,
            visibility: event.visibility,
            seriesId: event.seriesId,
            createdById: event.createdById,
          });
          return new NextResponse("Forbidden", { status: 403 });
        }
        break;
      }
      case "series-banner": {
        const seriesItem = await db.query.series.findFirst({
          where: eq(series.id, id),
          columns: {
            id: true,
            bannerS3Key: true,
            visibility: true,
            createdById: true,
          },
        });
        if (!seriesItem || !seriesItem.bannerS3Key) {
          return new NextResponse("Not Found", { status: 404 });
        }
        if (await can(user, "view", "series", seriesItem)) {
          s3Key = seriesItem.bannerS3Key;
          isPublic = seriesItem.visibility === "public";
        } else {
          return new NextResponse("Forbidden", { status: 403 });
        }
        break;
      }
      default:
        return new NextResponse("Invalid asset type", { status: 400 });
    }
    if (!s3Key) {
      return new NextResponse("Not Found", { status: 404 });
    }
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    });
    let s3Response: GetObjectCommandOutput;
    try {
      s3Response = await s3Client.send(command);
    } catch (error) {
      console.error(`Failed to fetch asset from S3:`, error);
      return new NextResponse("Failed to fetch asset", { status: 502 });
    }
    const headers = new Headers();
    if (s3Response.ContentType) {
      headers.set("Content-Type", s3Response.ContentType);
    }
    if (s3Response.ContentLength) {
      headers.set("Content-Length", String(s3Response.ContentLength));
    }
    if (isPublic) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      headers.set("Cache-Control", "private, max-age=3600");
    }
    return new NextResponse(s3Response.Body as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Error serving asset:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
