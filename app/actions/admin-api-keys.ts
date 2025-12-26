"use server";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { getUserContext } from "@/lib/policy";
export async function listAllApiKeys() {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user || !user.isGlobalAdmin) {
      return { success: false, error: "Unauthorized" };
    }
    const keys = await db.query.apiKeys.findMany({
      orderBy: [desc(apiKeys.createdAt)],
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarS3Key: true,
            handle: true,
          },
        },
      },
    });
    return { success: true, keys };
  } catch (error) {
    console.error("Error listing all API keys:", error);
    return { success: false, error: "Failed to list API keys" };
  }
}
export async function revokeApiKeyAdmin(id: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user || !user.isGlobalAdmin) {
      return { success: false, error: "Unauthorized" };
    }
    const apiKey = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.id, id),
      with: {
        user: true,
      },
    });
    if (!apiKey) {
      return { success: false, error: "Not found" };
    }
    await db.update(apiKeys).set({ isRevoked: true }).where(eq(apiKeys.id, id));
    await auditLog(user.id, "delete", "api_key", id, {
      name: apiKey.name,
      ownerId: apiKey.userId,
      ownerName: apiKey.user.name,
      adminRevoke: true,
    });
    revalidatePath("/admin/api-keys");
    return { success: true };
  } catch (error) {
    console.error("Error revoking API key:", error);
    return { success: false, error: "Failed to revoke API key" };
  }
}
