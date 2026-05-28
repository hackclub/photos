import { NextResponse } from "next/server";
import { flushSlackNotificationBatches } from "@/lib/slack-notifications";
import { recordCronJob } from "@/lib/telemetry";

export const maxDuration = 60;

export async function GET(req: Request) {
  const startedAt = Date.now();
  const authHeader = req.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    recordCronJob("slack_notifications", "unauthorized", startedAt);
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const result = await flushSlackNotificationBatches();
    recordCronJob("slack_notifications", "success", startedAt);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    recordCronJob("slack_notifications", "error", startedAt);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
