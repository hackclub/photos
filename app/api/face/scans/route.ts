import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { facePrivacyPreferences, faceScans } from "@/lib/db/schema";
import {
  claimFaceCaptureSession,
  completeFaceCaptureSession,
  failFaceCaptureSession,
} from "@/lib/face-capture-sessions";
import { createFaceScanForUser, FaceScanError } from "@/lib/face-scan";
import { logger } from "@/lib/logger";
import { getUserContext } from "@/lib/policy";
import { rateLimit } from "@/lib/rate-limit";

const MAX_FRAME_BYTES = 15 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 60 * 1024 * 1024;

export async function GET() {
  const session = await getSession();
  if (!session?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [scans, preferences] = await Promise.all([
    db.query.faceScans.findMany({
      where: and(
        eq(faceScans.userId, session.id),
        eq(faceScans.status, "ready"),
      ),
      columns: {
        id: true,
        isActive: true,
        highQuality: true,
        quality: true,
        spoofQuality: true,
        createdAt: true,
      },
      orderBy: [desc(faceScans.createdAt)],
      limit: 20,
    }),
    db.query.facePrivacyPreferences.findFirst({
      where: eq(facePrivacyPreferences.userId, session.id),
      columns: { autoSuggestionsEnabled: true },
    }),
  ]);
  return NextResponse.json({
    scans,
    autoSuggestionsEnabled: preferences?.autoSuggestionsEnabled ?? true,
  });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_CAPTURE_BYTES + 2 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Camera capture is too large" },
      { status: 413 },
    );
  }

  let captureToken: string | null = null;
  let captureLease: string | null = null;
  try {
    const browserSession = await getSession();
    captureToken = request.headers.get("x-face-capture-token");
    if (!browserSession?.id && !captureToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const claimed = captureToken
      ? await claimFaceCaptureSession(captureToken)
      : null;
    if (captureToken && !claimed) {
      return NextResponse.json(
        { error: "This phone capture link expired or is already in use" },
        { status: 409 },
      );
    }
    captureLease = claimed?.lease ?? null;
    const handoff = claimed?.session ?? null;

    const userId = handoff?.userId ?? browserSession?.id;
    const user = await getUserContext(userId);
    if (!user) {
      throw new FaceScanError("Unauthorized", 401);
    }
    const limited = await rateLimit(`face_scan:${user.id}`, {
      limit: 10,
      window: 60 * 60,
      failOpen: process.env.NODE_ENV !== "production",
    });
    if (!limited.success) {
      throw new FaceScanError(
        limited.backendAvailable
          ? "Too many face capture attempts"
          : "Face capture is temporarily unavailable",
        limited.backendAvailable ? 429 : 503,
      );
    }
    const form = await request.formData();

    const eventId = handoff?.eventId ?? String(form.get("eventId") ?? "");
    const highQuality =
      handoff?.mode === "blur" || form.get("highQuality") === "true";
    const autoSuggestions =
      handoff?.autoSuggestions ?? form.get("autoSuggestions") !== "false";
    const files = form
      .getAll("frames")
      .filter((value): value is File => value instanceof File);
    if (files.length < 2 || files.length > 10) {
      throw new FaceScanError("Capture between 2 and 10 camera frames", 400);
    }

    let totalBytes = 0;
    const frames: Buffer[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/") || file.size > MAX_FRAME_BYTES) {
        throw new FaceScanError("Invalid camera frame", 400);
      }
      totalBytes += file.size;
      if (totalBytes > MAX_CAPTURE_BYTES) {
        throw new FaceScanError("Camera capture is too large", 413);
      }
      frames.push(Buffer.from(await file.arrayBuffer()));
    }

    const scan = await createFaceScanForUser({
      user,
      eventId,
      frames,
      highQuality,
      autoSuggestions,
    });
    if (captureToken && captureLease) {
      let attached = false;
      for (let attempt = 0; attempt < 3 && !attached; attempt++) {
        try {
          attached = await completeFaceCaptureSession(
            captureToken,
            scan.id,
            captureLease,
          );
        } catch (attachError) {
          if (attempt === 2) {
            logger.error(
              "Failed to attach completed phone face scan",
              attachError,
            );
          } else {
            await new Promise((resolve) =>
              setTimeout(resolve, 150 * (attempt + 1)),
            );
          }
        }
      }
      if (!attached) {
        logger.error(
          "Completed phone face scan could not update its handoff session",
        );
      }
    }
    return NextResponse.json({ scan }, { status: 201 });
  } catch (error) {
    const known = error instanceof FaceScanError;
    const message = known ? error.message : "Face capture failed";
    if (captureToken && captureLease) {
      await failFaceCaptureSession(captureToken, message, captureLease).catch(
        () => undefined,
      );
    }
    if (!known) logger.error("Face capture failed", error);
    return NextResponse.json(
      {
        error: message,
        ...(known && error.reason ? { reason: error.reason } : {}),
      },
      { status: known ? error.status : 500 },
    );
  }
}
