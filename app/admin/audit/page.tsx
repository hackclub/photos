import { count, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { getUserContext } from "@/lib/auth-api";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { AuditClient } from "./AuditClient";
export default async function AuditLogsPage() {
  const { user } = await getUserContext();
  if (!user || !user.isGlobalAdmin) {
    redirect("/");
  }
  const [totalResult] = await db.select({ count: count() }).from(auditLogs);
  const totalCount = totalResult.count;
  const logs = await db.query.auditLogs.findMany({
    orderBy: [desc(auditLogs.createdAt)],
    limit: 50,
    with: {
      user: true,
    },
  });
  return (
    <div className="min-h-screen pb-12">
      <AdminPageHeader
        title="Audit Logs"
        description="View system activity and audit logs"
      />
      <AdminPageContent>
        <AuditClient initialLogs={logs} totalCount={totalCount} />
      </AdminPageContent>
    </div>
  );
}
