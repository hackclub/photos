import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listApiKeys } from "@/app/actions/api-keys";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { getSession } from "@/lib/auth";
import DeveloperDashboard from "./DeveloperClient";
export const metadata: Metadata = {
  title: "Developer Dashboard | Hack Club Photos",
  description: "Manage your API keys and test the Public API.",
  openGraph: {
    images: ["/api/og?type=developer"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/api/og?type=developer"],
  },
};
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
