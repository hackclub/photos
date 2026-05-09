import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listApiKeys } from "@/app/actions/api-keys";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { getSession } from "@/lib/auth";
import { createOgMetadata } from "@/lib/metadata";
import DeveloperDashboard from "./DeveloperClient";
export const metadata: Metadata = createOgMetadata({
  title: "Developer Dashboard | Hack Club Photos",
  description: "Manage your API keys and test the Public API.",
  path: "/developer",
  imagePath: "/api/og?type=developer",
  imageAlt: "Hack Club Photos developer dashboard",
});
export default async function DeveloperPage() {
  const session = await getSession();
  if (!session) {
    redirect("/auth/signin?callbackUrl=/developer");
  }
  const { keys } = await listApiKeys();
  return (
    <div className="min-h-screen pb-12">
      <AdminPageHeader
        title="Developer Dashboard"
        description="Manage your API keys and test the Public API."
      />

      <AdminPageContent>
        <DeveloperDashboard initialKeys={keys || []} />
      </AdminPageContent>
    </div>
  );
}
