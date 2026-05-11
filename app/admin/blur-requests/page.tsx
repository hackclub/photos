import { redirect } from "next/navigation";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { getSession } from "@/lib/auth";
import { getUserContext } from "@/lib/policy";
import BlurRequestsClient from "./BlurRequestsClient";

export default async function AdminBlurRequestsPage() {
  const session = await getSession();
  if (!session) redirect("/auth/signin");
  const ctx = await getUserContext(session.id);
  if (!ctx || ctx.isBanned || !ctx.isGlobalAdmin) redirect("/");
  return (
    <>
      <AdminPageHeader
        title="Blur Requests"
        description="Review privacy blur submissions."
      />
      <AdminPageContent>
        <BlurRequestsClient />
      </AdminPageContent>
    </>
  );
}
