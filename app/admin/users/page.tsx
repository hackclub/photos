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
      user: users,
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
      if (user.isBanned && user.bannedById) {
        const bannedByUser = await db.query.users.findFirst({
          where: eq(users.id, user.bannedById),
          columns: { name: true },
        });
        bannedByName = bannedByUser?.name;
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
