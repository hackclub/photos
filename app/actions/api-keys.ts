"use server";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { can, getUserContext } from "@/lib/policy";
export async function createApiKey(
  name: string,
  canUpload: boolean = false,
  note: string = "",
) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    if (!(await can(user, "create", "api_key", null))) {
      return { success: false, error: "Unauthorized" };
    }
    const key = `hcp_${randomBytes(24).toString("hex")}`;
    const [newKey] = await db
      .insert(apiKeys)
      .values({
        key,
        userId: user.id,
        name,
        canUpload,
        note,
      })
      .returning();
    await auditLog(user.id, "create", "api_key", newKey.id, {
      name,
      canUpload,
    });
    revalidatePath("/developer");
    return { success: true, key };
  } catch (error) {
    console.error("Error creating API key:", error);
    return { success: false, error: "Failed to create API key" };
  }
}
export async function listApiKeys() {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    if (!(await can(user, "view", "api_key", null))) {
      return { success: false, error: "Unauthorized" };
    }
    const keys = await db.query.apiKeys.findMany({
      where: and(eq(apiKeys.userId, user.id), eq(apiKeys.isRevoked, false)),
      orderBy: (apiKeys, { desc }) => [desc(apiKeys.createdAt)],
      columns: {
        id: true,
        name: true,
        note: true,
        createdAt: true,
        lastUsedAt: true,
        canUpload: true,
      },
    });
    return { success: true, keys };
  } catch (error) {
    console.error("Error listing API keys:", error);
    return { success: false, error: "Failed to list API keys" };
  }
}
export async function revokeApiKey(id: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    const apiKey = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.id, id),
    });
    if (!apiKey) {
      return { success: false, error: "Not found" };
    }
    if (!(await can(user, "delete", "api_key", apiKey))) {
      return { success: false, error: "Unauthorized" };
    }
    await db.update(apiKeys).set({ isRevoked: true }).where(eq(apiKeys.id, id));
    await auditLog(user.id, "delete", "api_key", id, { name: apiKey.name });
    revalidatePath("/developer");
    return { success: true };
  } catch (error) {
    console.error("Error revoking API key:", error);
    return { success: false, error: "Failed to revoke API key" };
  }
}
