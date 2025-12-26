import { headers } from "next/headers";
import { db } from "@/lib/db";
import { type auditActionEnum, auditLogs } from "@/lib/db/schema";
export async function auditLog(
  userId: string,
  action: (typeof auditActionEnum.enumValues)[number],
  resourceType: string,
  resourceId: string | null,
  details?: Record<string, any>,
) {
  try {
    const headersList = await headers();
    const rawIp = headersList.get("x-forwarded-for") || "unknown";
    const ipAddress = anonymizeIp(rawIp);
    const userAgent = headersList.get("user-agent") || "unknown";
    await db.insert(auditLogs).values({
      userId,
      action,
      resourceType,
      resourceId,
      details,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}
function anonymizeIp(ip: string): string {
  if (ip === "unknown") return ip;
  if (ip.includes(",")) {
    return ip
      .split(",")
      .map((i) => anonymizeIp(i.trim()))
      .join(", ");
  }
  if (ip.includes(".")) {
    return ip.replace(/\.\d+\.\d+$/, ".xxx.xxx");
  }
  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length > 2) {
      return `${parts.slice(0, 2).join(":")}:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx`;
    }
  }
  return ip;
}
