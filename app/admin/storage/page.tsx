import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/actions/users";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { getDetailedStorageStats } from "@/lib/media/s3";
import { getUserContext } from "@/lib/policy";
import { getDatabaseStorageStats } from "@/lib/storage";
import StorageClient from "./StorageClient";
export const metadata: Metadata = {
  title: "Storage Analytics | Admin | Hack Club Photos",
  description: "View storage usage statistics and breakdown",
};
export default async function StoragePage() {
  const userResult = await getCurrentUser();
  if (!userResult.success || !userResult.user) {
    redirect("/auth/signin?callbackUrl=/admin/storage");
  }
  const user = userResult.user;
  const ctx = await getUserContext(user.id);
  if (!ctx?.isGlobalAdmin) {
    redirect("/unauthorized");
  }
  const s3Stats = await getDetailedStorageStats();
  const dbStats = await getDatabaseStorageStats();
  const dashboardStats = {
    totalSize: s3Stats.totalSize,
    totalFiles: s3Stats.totalFiles,
    breakdown: s3Stats.breakdown,
    eventBreakdown: dbStats.eventBreakdown,
    userBreakdown: dbStats.userBreakdown.map((u) => ({
      id: u.id,
      name: u.name ? `${u.name} (${u.email})` : u.email,
      size: u.size,
      count: u.count,
      storageLimit: u.storageLimit,
      isGlobalAdmin: u.isGlobalAdmin,
    })),
  };
  return (
    <>
      <AdminPageHeader
        title="Storage Analytics"
        description="Overview of storage usage across the platform"
      />
      <AdminPageContent>
        <StorageClient stats={dashboardStats} />
      </AdminPageContent>
    </>
  );
}
