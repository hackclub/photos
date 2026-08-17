import { NextResponse } from "next/server";
import { markFaceCaptureOpened } from "@/lib/face-capture-sessions";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const capture = await markFaceCaptureOpened(token);
    if (!capture) {
      return NextResponse.json(
        { error: "Capture link expired" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Capture status unavailable" },
      { status: 503 },
    );
  }
}
