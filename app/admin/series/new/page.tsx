import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getUserContext } from "@/lib/policy";
import NewSeriesClient from "./NewSeriesClient";
export default async function NewSeriesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/auth/signin?callbackUrl=/admin/series/new");
  }
  const ctx = await getUserContext(session.id);
  if (!ctx || ctx.isBanned || !ctx.isGlobalAdmin) {
    redirect("/unauthorized");
  }
  return <NewSeriesClient />;
}
