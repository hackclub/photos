import { redirect } from "next/navigation";
import { listAllApiKeys } from "@/app/actions/admin-api-keys";
import { getCurrentUser } from "@/app/actions/users";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { getUserContext } from "@/lib/policy";
import ApiKeysClient from "./ApiKeysClient";
export default async function AdminApiKeysPage() {
  const userResult = await getCurrentUser();
  if (!userResult.success || !userResult.user) {
    redirect("/auth/signin?callbackUrl=/admin/api-keys");
  }
  const ctx = await getUserContext(userResult.user.id);
  if (!ctx || !ctx.isGlobalAdmin) {
    redirect("/unauthorized");
  }
  const keysResult = await listAllApiKeys();
  if (!keysResult.success || !keysResult.keys) {
    return (
      <div className="p-8 text-center text-red-400">
        Failed to load API keys.
      </div>
    );
  }
  return (
    <div className="min-h-screen pb-12">
      <AdminPageHeader
        title="API Keys"
        description="Manage all API keys across the platform"
      />

      <AdminPageContent>
        <ApiKeysClient initialKeys={keysResult.keys} />
      </AdminPageContent>
    </div>
  );
}
