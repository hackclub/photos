import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { joinEvent } from "@/app/actions/events";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: slug } = await params;
    const body = await req.json();
    const { inviteCode } = body;
    const event = await db.query.events.findFirst({
      where: eq(events.slug, slug),
    });
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const result = await joinEvent(event.id, inviteCode);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to join event" },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Join event error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
