import { count, desc, eq, sql, sum } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/actions/users";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { db } from "@/lib/db";
import { media, users } from "@/lib/db/schema";
import { getUserContext } from "@/lib/policy";
import UsersClient from "./UsersClient";
export default async function ManageUsersPage() {
  const userResult = await getCurrentUser();
  if (!userResult.success || !userResult.user) {
    redirect("/auth/signin?callbackUrl=/admin/users");
  }
  const ctx = await getUserContext(userResult.user.id);
  if (!ctx || ctx.isBanned || !ctx.isGlobalAdmin) {
    redirect("/unauthorized");
  }
  const usersWithStats = await db
    .select({
      user: {
        id: users.id,
        hackclubId: users.hackclubId,
        email: users.email,
        name: users.name,
        preferredName: users.preferredName,
        handle: users.handle,
        slackId: users.slackId,
        verificationStatus: users.verificationStatus,
        bio: users.bio,
        socialLinks: users.socialLinks,
        isGlobalAdmin: users.isGlobalAdmin,
        storageLimit: users.storageLimit,
        isBanned: users.isBanned,
        bannedAt: users.bannedAt,
        bannedById: users.bannedById,
        banReason: users.banReason,
        migratedToUserId: users.migratedToUserId,
        migrationMode: users.migrationMode,
        migrationMessage: users.migrationMessage,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      },
      photoCount: count(media.id),
      storageUsed: sum(media.fileSize),
    })
    .from(users)
    .leftJoin(media, sql`${users.id} = ${media.uploadedById}`)
    .where(sql`${users.deletedAt} IS NULL`)
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));
  const usersWithBannedBy = await Promise.all(
    usersWithStats.map(async ({ user, photoCount, storageUsed }) => {
      let bannedByName: string | undefined;
      let migratedToName: string | undefined;
      if (user.isBanned && user.bannedById) {
        const bannedByUser = await db.query.users.findFirst({
          where: eq(users.id, user.bannedById),
          columns: { name: true },
        });
        bannedByName = bannedByUser?.name;
      }
      if (user.migratedToUserId) {
        const migratedToUser = await db.query.users.findFirst({
          where: eq(users.id, user.migratedToUserId),
          columns: { name: true, handle: true, slackId: true },
        });
        migratedToName = migratedToUser
          ? `${migratedToUser.name}${migratedToUser.handle ? ` (@${migratedToUser.handle})` : ""}${migratedToUser.slackId ? ` / ${migratedToUser.slackId}` : ""}`
          : "Missing target";
      }
      const typedUser = {
        ...user,
        socialLinks:
          (user.socialLinks as Record<string, string> | null) || null,
      };
      return {
        user: typedUser,
        photoCount,
        storageUsed: Number(storageUsed || 0),
        bannedByName,
        migratedToName,
      };
    }),
  );
  const totalUsers = usersWithStats.length;
  const adminCount = usersWithStats.filter(
    ({ user }) => user.isGlobalAdmin,
  ).length;
  const verifiedCount = usersWithStats.filter(
    ({ user }) => user.verificationStatus === "verified",
  ).length;
  const bannedCount = usersWithStats.filter(({ user }) => user.isBanned).length;
  return (
    <div className="min-h-screen pb-12">
      <AdminPageHeader
        title="Manage Users"
        description="View and manage user accounts"
      />

      <AdminPageContent>
        <UsersClient
          usersWithStats={usersWithBannedBy}
          totalUsers={totalUsers}
          adminCount={adminCount}
          verifiedCount={verifiedCount}
          bannedCount={bannedCount}
        />
      </AdminPageContent>
    </div>
  );
}
