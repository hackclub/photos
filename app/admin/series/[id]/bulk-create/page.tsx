import { notFound, redirect } from "next/navigation";
import { getSeries } from "@/app/actions/series";
import { getCurrentUser } from "@/app/actions/users";
import { can, getUserContext } from "@/lib/policy";
import BulkCreateClient from "./BulkCreateClient";
export default async function BulkCreatePage({
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
  const result = await getSeries(id);
  if (!result.success || !result.series) {
    notFound();
  }
  const canEdit = await can(ctx, "manage", "series", result.series.id);
  if (!canEdit) {
    redirect("/unauthorized");
  }
  return (
    <BulkCreateClient
      seriesId={result.series.id}
      seriesName={result.series.name}
      seriesSlug={result.series.slug}
    />
  );
}
