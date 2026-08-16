import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
  consumeOAuthState,
  createOnboardingSession,
  createOrUpdateUser,
  createSession,
  deleteSession,
  exchangeCodeForToken,
  fetchHackClubUser,
  parseHackClubUser,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  if (error) {
    logger.error({ error }, "OAuth error");
    return NextResponse.redirect(
      new URL(`/auth/error?error=${error}`, process.env.NEXTAUTH_URL),
    );
  }
  if (!code) {
    logger.error("No code provided");
    return NextResponse.redirect(
      new URL("/auth/error?error=no_code", process.env.NEXTAUTH_URL),
    );
  }
  const callbackUrl = await consumeOAuthState(state);
  if (!callbackUrl) {
    logger.error("Invalid OAuth state");
    return NextResponse.redirect(
      new URL("/auth/error?error=invalid_state", process.env.NEXTAUTH_URL),
    );
  }
  try {
    const { accessToken, refreshToken } = await exchangeCodeForToken(
      code,
      `${process.env.NEXTAUTH_URL}/api/auth/callback`,
    );

    const hackclubUser = await fetchHackClubUser(accessToken);
    const hackclubId = hackclubUser.identity.id;
    const _email = hackclubUser.identity.primary_email;

    const existingUser = await db.query.users.findFirst({
      where: eq(users.hackclubId, hackclubId),
    });

    if (existingUser) {
      if (existingUser.migrationMode && existingUser.migratedToUserId) {
        const migratedTo = await db.query.users.findFirst({
          where: eq(users.id, existingUser.migratedToUserId),
        });
        if (!migratedTo || migratedTo.isBanned || migratedTo.deletedAt) {
          await deleteSession();
          return NextResponse.redirect(
            new URL(
              "/auth/error?error=migration_target_unavailable",
              process.env.NEXTAUTH_URL,
            ),
          );
        }
        if (existingUser.migrationMode === "notify") {
          await deleteSession();
          const message =
            existingUser.migrationMessage ||
            `You have been migrated to ${migratedTo.name}${migratedTo.slackId ? ` / ${migratedTo.slackId}` : ""} / ${migratedTo.hackclubId}. Please log in with that account.`;
          return NextResponse.redirect(
            new URL(
              `/auth/migrated?message=${encodeURIComponent(message)}`,
              process.env.NEXTAUTH_URL,
            ),
          );
        }
        await createSession({
          id: migratedTo.id,
          email: migratedTo.email,
          name: migratedTo.name,
          handle: migratedTo.handle,
          hackclubId: migratedTo.hackclubId,
          isGlobalAdmin: migratedTo.isGlobalAdmin,
          isBanned: migratedTo.isBanned,
          slackId: migratedTo.slackId,
        });
        if (!migratedTo.handle) {
          return NextResponse.redirect(
            new URL("/onboarding", process.env.NEXTAUTH_URL),
          );
        }
        return NextResponse.redirect(
          new URL(callbackUrl, process.env.NEXTAUTH_URL),
        );
      }
      const user = await createOrUpdateUser(
        hackclubUser,
        accessToken,
        refreshToken,
      );
      if (user.isBanned) {
        await deleteSession();
        return NextResponse.redirect(
          new URL("/banned", process.env.NEXTAUTH_URL),
        );
      }
      await createSession(user);
      if (!user.handle) {
        return NextResponse.redirect(
          new URL("/onboarding", process.env.NEXTAUTH_URL),
        );
      }
      return NextResponse.redirect(
        new URL(callbackUrl, process.env.NEXTAUTH_URL),
      );
    } else {
      const onboardingUser = parseHackClubUser(
        hackclubUser,
        accessToken,
        refreshToken,
      );
      await createOnboardingSession(onboardingUser);
      return NextResponse.redirect(
        new URL("/onboarding", process.env.NEXTAUTH_URL),
      );
    }
  } catch (error) {
    logger.error("Authentication error:", error);
    return NextResponse.redirect(
      new URL("/auth/error?error=auth_failed", process.env.NEXTAUTH_URL),
    );
  }
}
