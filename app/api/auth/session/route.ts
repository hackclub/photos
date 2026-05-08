import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getOnboardingSession, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getUserDisplayName, toPublicUser } from "@/lib/user-display";
export async function GET() {
  const session = await getSession();
  if (session) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.id),
      columns: {
        isBanned: true,
        slackId: true,
        handle: true,
      },
      with: {
        seriesAdminRoles: { limit: 1 },
        eventAdminRoles: { limit: 1 },
      },
    });
    if (user) {
      const hasAdminAccess =
        session.isGlobalAdmin ||
        user.seriesAdminRoles.length > 0 ||
        user.eventAdminRoles.length > 0;
      const res = NextResponse.json({
        user: {
          ...session,
          ...toPublicUser({ ...session, ...user }),
          isBanned: user.isBanned,
          slackId: user.slackId,
          hasAdminAccess,
        },
      });
      res.headers.set("Cache-Control", "no-store");
      res.headers.set("Pragma", "no-cache");
      res.headers.set("X-Content-Type-Options", "nosniff");
      res.headers.set("Vary", "Cookie, Authorization");
      return res;
    }
  }
  const onboardingSession = await getOnboardingSession();
  if (onboardingSession) {
    const res = NextResponse.json({
      onboardingUser: {
        ...onboardingSession,
        name: getUserDisplayName(),
      },
    });
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Vary", "Cookie, Authorization");
    return res;
  }
  const res = NextResponse.json({ user: session });
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Vary", "Cookie, Authorization");
  return res;
}
