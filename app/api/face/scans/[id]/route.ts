import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  faceBlurSubscriptions,
  facePrivacyPreferences,
  faceScans,
} from "@/lib/db/schema";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const scan = await db.query.faceScans.findFirst({
    where: and(eq(faceScans.id, id), eq(faceScans.userId, session.id)),
  });
  if (!scan)
    return NextResponse.json({ error: "Face scan not found" }, { status: 404 });

  await db.transaction(async (tx) => {
    await tx.delete(faceScans).where(eq(faceScans.id, id));
    if (scan.isActive) {
      const replacement = await tx.query.faceScans.findFirst({
        where: and(
          eq(faceScans.userId, session.id),
          eq(faceScans.status, "ready"),
        ),
        orderBy: [desc(faceScans.createdAt)],
      });
      if (replacement) {
        await tx
          .update(faceScans)
          .set({ isActive: true, updatedAt: new Date() })
          .where(eq(faceScans.id, replacement.id));
      } else {
        await tx
          .update(facePrivacyPreferences)
          .set({
            matchingEnabled: false,
            revokedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(facePrivacyPreferences.userId, session.id));
        await tx
          .update(faceBlurSubscriptions)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(faceBlurSubscriptions.userId, session.id));
      }
    }
  });
  await auditLog(session.id, "delete", "face_scan", id);
  return NextResponse.json({ ok: true });
}
