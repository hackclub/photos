import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/actions/users";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { getUserContext } from "@/lib/policy";
import FaceAdminClient from "./FaceAdminClient";

export const metadata: Metadata = {
  title: "Face Indexing | Admin | Hack Club Photos",
};

export default async function FaceAdminPage() {
  const current = await getCurrentUser();
  if (!current.success || !current.user) {
    redirect("/auth/signin?callbackUrl=/admin/faces");
  }
  const context = await getUserContext(current.user.id);
  if (!context?.isGlobalAdmin) redirect("/unauthorized");
  return (
    <>
      <AdminPageHeader
        title="Face indexing"
        description="Control event indexing, automatic scans, suggestions, and the vision queue."
      />
      <AdminPageContent>
        <FaceAdminClient />
      </AdminPageContent>
    </>
  );
}
