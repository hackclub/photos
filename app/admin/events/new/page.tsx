import { inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { series } from "@/lib/db/schema";
import { getUserContext } from "@/lib/policy";
import NewEventClient from "./NewEventClient";
export default async function NewEventPage() {
  const session = await getSession();
  if (!session) {
    redirect("/auth/signin?callbackUrl=/admin/events/new");
  }
  const ctx = await getUserContext(session.id);
  if (!ctx || ctx.isBanned) {
    redirect("/unauthorized");
  }
  if (!ctx.isGlobalAdmin && ctx.seriesAdmins.length === 0) {
    redirect("/unauthorized");
  }
  let allowedSeries: (typeof series.$inferSelect)[] = [];
  if (ctx.isGlobalAdmin) {
    allowedSeries = await db.select().from(series);
  } else {
    const seriesIds = ctx.seriesAdmins.map((sa) => sa.seriesId);
    if (seriesIds.length > 0) {
      allowedSeries = await db
        .select()
        .from(series)
        .where(inArray(series.id, seriesIds));
    }
  }
  return <NewEventClient allowedSeries={allowedSeries} />;
}
