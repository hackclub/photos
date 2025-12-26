import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/actions/users";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { getUserContext } from "@/lib/policy";
import TagsClient from "./TagsClient";
export const metadata: Metadata = {
  title: "Manage Tags | Admin",
};
export default async function TagsManagementPage() {
  const userResult = await getCurrentUser();
  if (!userResult.success || !userResult.user) {
    redirect("/auth/signin?callbackUrl=/admin/tags");
  }
  const user = userResult.user;
  const ctx = await getUserContext(user.id);
  if (!ctx?.isGlobalAdmin) {
    redirect("/unauthorized");
  }
  return (
    <div className="min-h-screen pb-12">
      <AdminPageHeader
        title="Manage Tags"
        description="View and manage all tags used across the platform"
      />
      <AdminPageContent>
        <TagsClient />
      </AdminPageContent>
    </div>
  );
}
