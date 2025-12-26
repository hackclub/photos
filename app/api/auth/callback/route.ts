import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
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
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state") || "/";
  const error = searchParams.get("error");
  if (error) {
    console.error("OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/auth/error?error=${error}`, process.env.NEXTAUTH_URL),
    );
  }
  if (!code) {
    console.error("No code provided");
    return NextResponse.redirect(
      new URL("/auth/error?error=no_code", process.env.NEXTAUTH_URL),
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
      return NextResponse.redirect(new URL(state, process.env.NEXTAUTH_URL));
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
    console.error("Authentication error:", error);
    return NextResponse.redirect(
      new URL(
        `/auth/error?error=auth_failed&message=${encodeURIComponent(error instanceof Error ? error.message : "Unknown error")}`,
        process.env.NEXTAUTH_URL,
      ),
    );
  }
}
