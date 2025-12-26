import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys, users } from "@/lib/db/schema";
import type { UserContext } from "@/lib/policy";
import { rateLimit } from "@/lib/rate-limit";

export function getClientIpFromHeaders(
  headersList: Headers,
  fallback: string = "anonymous",
): string {
  const xff = headersList.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const xRealIp = headersList.get("x-real-ip")?.trim();
  if (xRealIp) return xRealIp;

  return fallback;
}

const RATE_LIMIT_MAX_REQUESTS = 1000;
const RATE_LIMIT_UPLOAD_MAX_REQUESTS = 100;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // 1 hour

export async function validateApiKey(requireUpload: boolean = false) {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const key = authHeader.split(" ")[1];
  try {
    const apiKey = await db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.key, key), eq(apiKeys.isRevoked, false)),
      with: {
        user: true,
      },
    });
    if (!apiKey) {
      return null;
    }
    if (apiKey.user.isBanned) {
      return null;
    }
    if (requireUpload && !apiKey.canUpload) {
      return null;
    }

    const limit = requireUpload
      ? RATE_LIMIT_UPLOAD_MAX_REQUESTS
      : RATE_LIMIT_MAX_REQUESTS;

    const rateLimitResult = await rateLimit(`api_key:${apiKey.id}`, {
      limit,
      window: RATE_LIMIT_WINDOW_SECONDS,
      failOpen: false,
    });

    if (!rateLimitResult.success) {
      return null;
    }

    db.update(apiKeys)
      .set({
        lastUsedAt: new Date(),
      })
      .where(eq(apiKeys.id, apiKey.id))
      .catch((err) => console.error("Failed to update API key stats:", err));
    return { user: apiKey.user, apiKeyId: apiKey.id, apiKeyName: apiKey.name };
  } catch (error) {
    console.error("Error validating API key:", error);
    return null;
  }
}
export function unauthorizedResponse() {
  return Response.json(
    {
      error: "Unauthorized",
      message: "Invalid, missing, or rate-limited API key",
    },
    { status: 401 },
  );
}
export async function getUserContext(): Promise<{
  user: UserContext | null;
  error?: Response;
}> {
  const session = await getSession();
  if (!session) {
    return {
      user: null,
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.id),
    columns: {
      id: true,
      isGlobalAdmin: true,
      isBanned: true,
    },
    with: {
      seriesAdminRoles: {
        columns: { seriesId: true },
      },
      eventAdminRoles: {
        columns: { eventId: true },
      },
    },
  });
  if (!user) {
    return {
      user: null,
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.isBanned) {
    return {
      user: null,
      error: Response.json(
        { error: "Forbidden", message: "User is banned" },
        { status: 403 },
      ),
    };
  }
  return {
    user: {
      id: user.id,
      isGlobalAdmin: user.isGlobalAdmin,
      isBanned: user.isBanned || false,
      seriesAdmins: user.seriesAdminRoles,
      eventAdmins: user.eventAdminRoles,
    },
  };
}
