"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import {
  createSession,
  deleteOnboardingSession,
  getOnboardingSession,
  getSession,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getUserContext } from "@/lib/policy";
export async function checkHandleAvailability(handle: string) {
  if (!handle || handle.length < 3 || handle.length > 20) {
    return {
      available: false,
      error: "Handle must be between 3 and 20 characters",
    };
  }
  const handleRegex = /^[a-zA-Z0-9_]+$/;
  if (!handleRegex.test(handle)) {
    return {
      available: false,
      error: "Handle can only contain letters, numbers, and underscores",
    };
  }
  try {
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, handle))
      .limit(1);
    if (existingUser.length > 0) {
      return { available: false, error: "Handle is already taken" };
    }
    return { available: true };
  } catch (error) {
    console.error("Error checking handle availability:", error);
    return { available: false, error: "Internal server error" };
  }
}
export async function completeOnboarding(data: {
  handle: string;
  name: string;
  avatarS3Key?: string;
  avatarSource?: "upload" | "slack" | "gravatar" | "libravatar" | "dicebear";
}) {
  const session = await getSession();
  const onboardingSession = await getOnboardingSession();
  if (!session && !onboardingSession) {
    return { success: false, error: "Unauthorized" };
  }
  if (session) {
    const user = await getUserContext(session.id);
    if (user?.isBanned) {
      return { success: false, error: "Unauthorized" };
    }
  }
  const { handle, name, avatarS3Key } = data;
  const availability = await checkHandleAvailability(handle);
  if (!availability.available) {
    return {
      success: false,
      error: availability.error || "Handle is not available",
    };
  }
  try {
    if (session) {
      const finalAvatarS3Key =
        data.avatarSource !== "upload"
          ? null
          : avatarS3Key !== undefined
            ? avatarS3Key
            : session.avatarS3Key;
      await db
        .update(users)
        .set({
          handle,
          preferredName: name,
          avatarS3Key: finalAvatarS3Key,
          avatarSource: data.avatarSource || "dicebear",
          updatedAt: new Date(),
        })
        .where(eq(users.id, session.id));
      await auditLog(session.id, "update", "user", session.id, {
        action: "onboarding_update",
        handle,
        preferredName: name,
      });
      const updatedUser = {
        ...session,
        handle,
        name,
        avatarS3Key: finalAvatarS3Key,
      };
      await createSession(updatedUser);
    } else if (onboardingSession) {
      const existingUser = await db.query.users.findFirst({
        where: eq(users.hackclubId, onboardingSession.hackclubId),
      });
      if (existingUser) {
        const finalAvatarS3Key =
          data.avatarSource !== "upload" ? null : avatarS3Key;
        await db
          .update(users)
          .set({
            handle,
            preferredName: name,
            avatarS3Key: finalAvatarS3Key,
            avatarSource: data.avatarSource || "dicebear",
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id));
        await createSession({
          id: existingUser.id,
          email: existingUser.email,
          name: name,
          handle: handle,
          hackclubId: existingUser.hackclubId,
          isGlobalAdmin: existingUser.isGlobalAdmin,
          isBanned: existingUser.isBanned,
          avatarS3Key: finalAvatarS3Key,
        });
      } else {
        const [newUser] = await db
          .insert(users)
          .values({
            hackclubId: onboardingSession.hackclubId,
            email: onboardingSession.email,
            name: onboardingSession.name,
            preferredName: name,
            handle,
            slackId: onboardingSession.slackId,
            verificationStatus: onboardingSession.verificationStatus,
            hcaAccessToken: onboardingSession.hcaAccessToken,
            avatarS3Key: data.avatarSource !== "upload" ? null : avatarS3Key,
            avatarSource: data.avatarSource || "dicebear",
          })
          .returning();
        await auditLog(newUser.id, "create", "user", newUser.id, {
          action: "onboarding_create",
          handle,
        });
        await createSession({
          id: newUser.id,
          email: newUser.email,
          name: newUser.preferredName || newUser.name,
          handle: newUser.handle,
          hackclubId: newUser.hackclubId,
          isGlobalAdmin: newUser.isGlobalAdmin,
          isBanned: newUser.isBanned,
          avatarS3Key: newUser.avatarS3Key,
        });
      }
      await deleteOnboardingSession();
    }
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Error completing onboarding:", error);
    return { success: false, error: "Failed to complete onboarding" };
  }
}
