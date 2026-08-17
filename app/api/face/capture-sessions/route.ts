import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { createFaceCaptureSession } from "@/lib/face-capture-sessions";
import { can, getUserContext } from "@/lib/policy";
import { rateLimit } from "@/lib/rate-limit";

const inputSchema = z
  .object({
    eventId: z.string().uuid(),
    mode: z.enum(["filter", "blur"]),
    autoSuggestions: z.boolean().default(true),
  })
  .strict();

export async function POST(request: Request) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid capture request" },
      { status: 400 },
    );
  }
  if (!(await can(user, "view", "event", parsed.data.eventId))) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const limited = await rateLimit(`face_capture_session:${user.id}`, {
    limit: 20,
    window: 60 * 60,
    failOpen: process.env.NODE_ENV !== "production",
  });
  if (!limited.success) {
    return NextResponse.json(
      {
        error: limited.backendAvailable
          ? "Too many phone capture links"
          : "Phone capture is temporarily unavailable",
      },
      { status: limited.backendAvailable ? 429 : 503 },
    );
  }
  const event = await db.query.events.findFirst({
    where: eq(events.id, parsed.data.eventId),
    columns: { name: true },
  });
  if (!event)
    return NextResponse.json({ error: "Event not found" }, { status: 404 });

  try {
    const { token, session: capture } = await createFaceCaptureSession({
      userId: user.id,
      eventId: parsed.data.eventId,
      eventName: event.name,
      mode: parsed.data.mode,
      autoSuggestions: parsed.data.autoSuggestions,
    });
    const origin =
      process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    return NextResponse.json({
      token,
      url: new URL(`/face-capture/${token}`, origin).toString(),
      expiresAt: capture.expiresAt,
    });
  } catch {
    return NextResponse.json(
      { error: "Phone capture is temporarily unavailable" },
      { status: 503 },
    );
  }
}
