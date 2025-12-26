import { notFound, redirect } from "next/navigation";
import { getEventAdmins } from "@/app/actions/admins";
import { getEvent } from "@/app/actions/events";
import { getAllSeries } from "@/app/actions/series";
import { getCurrentUser } from "@/app/actions/users";
import type { eventAdmins, users } from "@/lib/db/schema";
import { can, getUserContext } from "@/lib/policy";
import EditEventClient from "./EditEventClient";
export default async function EditEventPage({
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
  const canEdit = await can(ctx, "manage", "event", id);
  if (!canEdit) {
    redirect("/unauthorized");
  }
  const eventResult = await getEvent(id);
  if (!eventResult.success || !eventResult.event) {
    notFound();
  }
  const event = eventResult.event;
  const seriesResult = await getAllSeries();
  let series = seriesResult.success ? seriesResult.series || [] : [];
  if (!ctx.isGlobalAdmin) {
    const seriesIds = ctx.seriesAdmins.map((sa) => sa.seriesId);
    series = series.filter((s) => seriesIds.includes(s.id));
  }
  const isGlobal = ctx.isGlobalAdmin;
  const isSeries = event.seriesId
    ? await can(ctx, "manage", "series", event.seriesId)
    : false;
  let initialAdmins: (typeof eventAdmins.$inferSelect & {
    user: Pick<typeof users.$inferSelect, "id" | "name" | "email">;
  })[] = [];
  const adminsResult = await getEventAdmins(id);
  if (adminsResult.success && adminsResult.admins) {
    initialAdmins = adminsResult.admins;
  }
  return (
    <EditEventClient
      event={event}
      series={series}
      initialAdmins={initialAdmins}
      isGlobalAdmin={isGlobal}
      isSeriesAdmin={isSeries}
    />
  );
}
