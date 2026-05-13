import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/actions/users";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { getUserContext } from "@/lib/policy";
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
  return (
    <>
      <AdminPageHeader
        title="Storage Analytics"
        description="Overview of storage usage across the platform"
      />
      <AdminPageContent>
        <StorageClient />
      </AdminPageContent>
    </>
  );
}
