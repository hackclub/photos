import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getFaceCaptureSession,
  revokeFaceCaptureSession,
} from "@/lib/face-capture-sessions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const capture = await getFaceCaptureSession(token);
    if (!capture) {
      return NextResponse.json(
        { error: "Capture link expired" },
        { status: 404 },
      );
    }
    const session = await getSession();
    const owner = session?.id === capture.userId;
    return NextResponse.json({
      status: capture.status,
      eventName: capture.eventName,
      mode: capture.mode,
      expiresAt: capture.expiresAt,
      error: capture.error,
      ...(owner && capture.scanId ? { scanId: capture.scanId } : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Capture status unavailable" },
      { status: 503 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { token } = await params;
    const revoked = await revokeFaceCaptureSession(token, session.id);
    return revoked
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Capture link not found" }, { status: 404 });
  } catch {
    return NextResponse.json(
      { error: "Capture status unavailable" },
      { status: 503 },
    );
  }
}
