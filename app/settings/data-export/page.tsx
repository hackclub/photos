import { redirect } from "next/navigation";
import { getLatestExport } from "@/app/actions/data-export";
import { getSession } from "@/lib/auth";
import DataExportClient from "./DataExportClient";
export default async function DataExportPage() {
  const session = await getSession();
  if (!session) {
    redirect("/auth/signin");
  }
  const result = await getLatestExport();
  const latestExport = result.success && result.export ? result.export : null;
  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-12">
      <DataExportClient latestExport={latestExport} />
    </div>
  );
}
