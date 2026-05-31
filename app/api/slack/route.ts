import { NextResponse } from "next/server";
import {
  isSlackCategory,
  publishSlackAppHome,
  setSlackNotificationPreference,
  verifySlackRequest,
} from "@/lib/slack-notifications";

const MAX_SLACK_BODY_BYTES = 1024 * 1024;

export async function POST(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (!contentLength || contentLength > MAX_SLACK_BODY_BYTES) {
    return new NextResponse("Payload Too Large", { status: 413 });
  }
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody) > MAX_SLACK_BODY_BYTES) {
    return new NextResponse("Payload Too Large", { status: 413 });
  }
  if (!(await verifySlackRequest(req, rawBody))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? JSON.parse(rawBody)
    : JSON.parse(new URLSearchParams(rawBody).get("payload") || "{}");

  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type === "event_callback") {
    if (payload.event?.type === "app_home_opened" && payload.event.user) {
      await publishSlackAppHome(payload.event.user);
    }
    return NextResponse.json({ ok: true });
  }

  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    if (action?.action_id === "slack_notification_toggle") {
      const category =
        action.options?.[0]?.value || action.selected_options?.[0]?.value;
      const enabled = Boolean(action.selected_options?.length);
      if (typeof category === "string" && isSlackCategory(category)) {
        await setSlackNotificationPreference(
          payload.user.id,
          category,
          enabled,
        );
        await publishSlackAppHome(payload.user.id);
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
