import { redirect } from "next/navigation";
import { getAnalyticsData } from "@/app/actions/analytics";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { getUserContext } from "@/lib/auth-api";
import AnalyticsClient from "./AnalyticsClient";

export default async function AnalyticsPage() {
  const { user } = await getUserContext();
  if (!user?.isGlobalAdmin) redirect("/");

  const data = await getAnalyticsData(30);

  return (
    <div className="min-h-screen pb-12">
      <AdminPageHeader
        title="Analytics"
        description="Product adoption, event health, and privacy activity from your first-party audit trail."
      />
      <AdminPageContent className="max-w-[90rem]">
        <AnalyticsClient
          initialData={
            data as unknown as import("./AnalyticsClient").AnalyticsData
          }
        />
      </AdminPageContent>
    </div>
  );
}
