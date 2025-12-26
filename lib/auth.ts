import { eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { cookies, headers } from "next/headers";
import { HACK_CLUB_AUTH_URL } from "@/lib/constants";
import { db } from "./db";
import { users } from "./db/schema";

const nextAuthSecret = process.env.NEXTAUTH_SECRET;

if (!nextAuthSecret) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET is required in production");
  }
  console.warn(
    "[auth] NEXTAUTH_SECRET is not set; sessions are insecure. Set NEXTAUTH_SECRET in your environment.",
  );
}

const JWT_SECRET = new TextEncoder().encode(nextAuthSecret || "dev-insecure");
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  handle?: string | null;
  hackclubId: string;
  isGlobalAdmin: boolean;
  isBanned?: boolean;
  avatarS3Key?: string | null;
  slackId?: string | null;
  avatarSource?: "upload" | "slack" | "gravatar" | "libravatar" | "dicebear";
  hasAdminAccess?: boolean;
}
export interface OnboardingUser {
  hackclubId: string;
  email: string;
  name: string;
  slackId: string;
  verificationStatus: string;
  hcaAccessToken: string;
  hcaRefreshToken?: string;
}
export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
  const cookieStore = await cookies();
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return token;
}
export async function createOnboardingSession(user: OnboardingUser) {
  const token = await new SignJWT({ onboardingUser: user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(JWT_SECRET);
  const cookieStore = await cookies();
  cookieStore.set("onboarding_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
  return token;
}
export async function createMobileToken(user: SessionUser) {
  const token = await new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("365d")
    .sign(JWT_SECRET);
  return token;
}
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  let token = cookieStore.get("session")?.value;
  if (!token) {
    const headersList = await headers();
    const authHeader = headersList.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.user as SessionUser;
  } catch (_error) {
    return null;
  }
}
export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.user as SessionUser;
  } catch (_error) {
    return null;
  }
}
export async function getOnboardingSession(): Promise<OnboardingUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("onboarding_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.onboardingUser as OnboardingUser;
  } catch (_error) {
    return null;
  }
}
export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}
export async function deleteOnboardingSession() {
  const cookieStore = await cookies();
  cookieStore.delete("onboarding_session");
}
export async function exchangeCodeForToken(code: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.HACKCLUB_CLIENT_ID!,
    client_secret: process.env.HACKCLUB_CLIENT_SECRET!,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const response = await fetch(`${HACK_CLUB_AUTH_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("Token exchange failed with status:", response.status);
    throw new Error(
      `Failed to exchange code for token: ${response.status} - ${responseText}`,
    );
  }

  const data = JSON.parse(responseText) as {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
  };

  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

async function refreshAccessToken(refreshToken: string) {
  const params = new URLSearchParams({
    client_id: process.env.HACKCLUB_CLIENT_ID!,
    client_secret: process.env.HACKCLUB_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(`${HACK_CLUB_AUTH_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("Token refresh failed with status:", response.status);
    throw new Error(
      `Failed to refresh access token: ${response.status} - ${responseText}`,
    );
  }

  const data = JSON.parse(responseText) as {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
  };

  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}
export async function fetchHackClubUser(accessToken: string) {
  const response = await fetch(`${HACK_CLUB_AUTH_URL}/api/v1/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized: Token expired or invalid");
    }
    const error = await response.text();
    console.error("User fetch failed:", error);
    throw new Error(`Failed to fetch user: ${response.status}`);
  }
  const userData = await response.json();
  return userData;
}
interface HackClubIdentity {
  id: string;
  primary_email: string;
  first_name: string;
  last_name: string;
  slack_id: string;
  verification_status: string;
}
interface HackClubUserResponse {
  identity: HackClubIdentity;
}
export function parseHackClubUser(
  hackclubData: HackClubUserResponse,
  accessToken: string,
  refreshToken?: string,
): OnboardingUser {
  const identity = hackclubData.identity;
  return {
    hackclubId: identity.id,
    email: identity.primary_email,
    name: `${identity.first_name} ${identity.last_name}`.trim(),
    slackId: identity.slack_id,
    verificationStatus: identity.verification_status,
    hcaAccessToken: accessToken,
    hcaRefreshToken: refreshToken,
  };
}
export async function createOrUpdateUser(
  hackclubData: HackClubUserResponse,
  accessToken: string,
  refreshToken?: string,
): Promise<SessionUser> {
  const userData = parseHackClubUser(hackclubData, accessToken, refreshToken);
  const { email, name, hackclubId, slackId, verificationStatus } = userData;

  const existingUser = await db.query.users.findFirst({
    where: eq(users.hackclubId, hackclubId),
  });

  if (existingUser) {
    await db
      .update(users)
      .set({
        name,
        slackId,
        verificationStatus,
        hcaAccessToken: accessToken,
        ...(refreshToken ? { hcaRefreshToken: refreshToken } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id));

    return {
      id: existingUser.id,
      email: existingUser.email,
      name: existingUser.preferredName || name,
      handle: existingUser.handle,
      hackclubId: existingUser.hackclubId,
      isGlobalAdmin: existingUser.isGlobalAdmin,
      isBanned: existingUser.isBanned,
      avatarS3Key: existingUser.avatarS3Key,
      slackId: existingUser.slackId,
      avatarSource: existingUser.avatarSource,
    };
  }

  const [newUser] = await db
    .insert(users)
    .values({
      hackclubId,
      email,
      name,
      slackId,
      verificationStatus,
      hcaAccessToken: accessToken,
      ...(refreshToken ? { hcaRefreshToken: refreshToken } : {}),
    })
    .returning();

  return {
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    handle: newUser.handle,
    hackclubId: newUser.hackclubId,
    isGlobalAdmin: newUser.isGlobalAdmin,
    isBanned: newUser.isBanned,
    avatarS3Key: newUser.avatarS3Key,
    slackId: newUser.slackId,
    avatarSource: newUser.avatarSource,
  };
}
export async function refreshUser(userId: string) {
  try {
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!dbUser?.hcaAccessToken) return null;

    try {
      const hackclubUser = await fetchHackClubUser(dbUser.hcaAccessToken);
      return await createOrUpdateUser(
        hackclubUser,
        dbUser.hcaAccessToken,
        dbUser.hcaRefreshToken ?? undefined,
      );
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message === "Unauthorized: Token expired or invalid"
      ) {
        if (!dbUser.hcaRefreshToken) {
          console.log(
            "Token expired and no refresh token; logging out:",
            userId,
          );
          await deleteSession();
          return null;
        }

        const refreshed = await refreshAccessToken(dbUser.hcaRefreshToken);

        await db
          .update(users)
          .set({
            hcaAccessToken: refreshed.accessToken,
            ...(refreshed.refreshToken
              ? { hcaRefreshToken: refreshed.refreshToken }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        const hackclubUser = await fetchHackClubUser(refreshed.accessToken);
        return await createOrUpdateUser(
          hackclubUser,
          refreshed.accessToken,
          refreshed.refreshToken ?? dbUser.hcaRefreshToken ?? undefined,
        );
      }

      throw error;
    }
  } catch (error: unknown) {
    console.error("Error refreshing user data:", error);
    return null;
  }
}
