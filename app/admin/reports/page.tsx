import { redirect } from "next/navigation";
import ReportsClient from "@/app/admin/reports/ReportsClient";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { getSession } from "@/lib/auth";
import { getUserContext } from "@/lib/policy";
export default async function AdminReportsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/auth/signin");
  }
  const ctx = await getUserContext(session.id);
  if (!ctx || ctx.isBanned || !ctx.isGlobalAdmin) {
    redirect("/");
  }
  return (
    <>
      <AdminPageHeader
        title="Content Reports"
        description="Review and manage reported content and users."
      />
      <AdminPageContent>
        <ReportsClient />
      </AdminPageContent>
    </>
  );
}
