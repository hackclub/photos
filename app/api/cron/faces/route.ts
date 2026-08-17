import { type NextRequest, NextResponse } from "next/server";
import {
  getFaceSystemSettings,
  queuePendingFaceMedia,
  syncFaceIndexJobs,
} from "@/lib/face-indexing";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const settings = await getFaceSystemSettings();
  if (settings.paused) return NextResponse.json({ paused: true });
  const synchronized = await syncFaceIndexJobs(250);
  const queued = settings.scanNewUploads
    ? await queuePendingFaceMedia({ limit: 250 })
    : { queued: 0, found: 0 };
  return NextResponse.json({ synchronized, queued });
}
