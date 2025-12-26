import { notFound, redirect } from "next/navigation";
import { getSeriesAdmins } from "@/app/actions/admins";
import { getSeries } from "@/app/actions/series";
import { getCurrentUser } from "@/app/actions/users";
import type { seriesAdmins, users } from "@/lib/db/schema";
import { can, getUserContext } from "@/lib/policy";
import EditSeriesClient from "./EditSeriesClient";
export default async function EditSeriesPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await params;
  const userResult = await getCurrentUser();
  if (!userResult.success || !userResult.user) {
    redirect("/auth/signin");
  }
  const ctx = await getUserContext(userResult.user.id);
  if (!ctx || ctx.isBanned) {
    redirect("/unauthorized");
  }
  const canEdit = await can(ctx, "manage", "series", id);
  if (!canEdit) {
    redirect("/unauthorized");
  }
  const seriesResult = await getSeries(id);
  if (!seriesResult.success || !seriesResult.series) {
    notFound();
  }
  const series = seriesResult.series;
  const isGlobal = ctx.isGlobalAdmin;
  let initialAdmins: (typeof seriesAdmins.$inferSelect & {
    user: Pick<typeof users.$inferSelect, "id" | "name" | "email">;
  })[] = [];
  const adminsResult = await getSeriesAdmins(id);
  if (adminsResult.success && adminsResult.admins) {
    initialAdmins = adminsResult.admins;
  }
  return (
    <EditSeriesClient
      series={series}
      initialAdmins={initialAdmins}
      isGlobalAdmin={isGlobal}
    />
  );
}
