"use server";

import { sql } from "drizzle-orm";
import { getUserContext } from "@/lib/auth-api";
import { db } from "@/lib/db";

export async function getAnalyticsData(days = 30) {
  const { user } = await getUserContext();
  if (!user?.isGlobalAdmin) throw new Error("Unauthorized");
  const windowDays = [7, 30, 90, 365].includes(days) ? days : 30;
  const start = windowDays - 1;
  const [overviewRows, activityRows, actionsRows, eventsRows, featureRows] =
    await Promise.all([
      db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM users WHERE deleted_at IS NULL) AS users,
        (SELECT count(DISTINCT user_id)::int FROM audit_logs WHERE created_at >= now() - (${windowDays} * interval '1 day')) AS active_users_30d,
        (SELECT count(*)::int FROM events) AS events,
        (SELECT count(*)::int FROM media) AS photos,
        (SELECT coalesce(sum(file_size), 0)::bigint FROM media) AS uploaded_bytes,
        (SELECT count(*)::int FROM face_scans WHERE status = 'ready') AS face_scans,
        (SELECT count(*)::int FROM face_privacy_preferences WHERE matching_enabled) AS face_matching_enabled,
        (SELECT count(*)::int FROM face_blur_subscriptions WHERE active) AS active_blur_subscriptions,
        (SELECT count(*)::int FROM users WHERE deleted_at IS NOT NULL) AS deleted_profiles,
        (SELECT count(*)::int FROM audit_logs WHERE action = 'upload' AND resource_type = 'media' AND created_at >= now() - (${windowDays} * interval '1 day')) AS uploads_30d,
        (SELECT count(*)::int FROM audit_logs WHERE action = 'join' AND resource_type = 'event' AND created_at >= now() - (${windowDays} * interval '1 day')) AS event_joins,
        (SELECT count(*)::int FROM audit_logs WHERE action = 'download' AND resource_type = 'media' AND created_at >= now() - (${windowDays} * interval '1 day')) AS downloads,
        (SELECT count(*)::int FROM audit_logs WHERE action = 'create' AND resource_type = 'data_export' AND created_at >= now() - (${windowDays} * interval '1 day')) AS exports,
        (SELECT count(*)::int FROM audit_logs WHERE action = 'create' AND resource_type = 'share_link' AND created_at >= now() - (${windowDays} * interval '1 day')) AS shares,
        (SELECT count(*)::int FROM audit_logs WHERE action = 'create' AND resource_type = 'report' AND created_at >= now() - (${windowDays} * interval '1 day')) AS reports,
        (SELECT count(*)::int FROM audit_logs WHERE action = 'create' AND resource_type = 'face_blur_subscription' AND created_at >= now() - (${windowDays} * interval '1 day')) AS blur_opt_ins,
        (SELECT count(*)::int FROM blur_requests WHERE source = 'automatic_face' AND status = 'approved' AND resolved_at >= now() - (${windowDays} * interval '1 day')) AS automatic_blurs
    `),
      db.execute(sql`
      WITH days AS (
        SELECT generate_series(current_date - (${start} * interval '1 day'), current_date, interval '1 day')::date AS day
      ), activity AS (
        SELECT date_trunc('day', created_at)::date AS day,
          count(DISTINCT user_id) AS users,
          count(*) FILTER (WHERE action = 'upload' AND resource_type = 'media') AS uploads,
          count(*) FILTER (WHERE resource_type = 'face_search') AS searches,
          count(*) FILTER (WHERE resource_type = 'face_scan' AND action = 'create') AS scans,
          count(*) FILTER (WHERE resource_type = 'blur_request') AS blur_requests
        FROM audit_logs
        WHERE created_at >= current_date - (${start} * interval '1 day')
        GROUP BY 1
      )
      SELECT to_char(days.day, 'Mon DD') AS day,
        coalesce(activity.users, 0)::int AS users,
        coalesce(activity.uploads, 0)::int AS uploads,
        coalesce(activity.searches, 0)::int AS searches,
        coalesce(activity.scans, 0)::int AS scans,
        coalesce(activity.blur_requests, 0)::int AS blur_requests
      FROM days LEFT JOIN activity USING (day) ORDER BY days.day
    `),
      db.execute(sql`
      SELECT resource_type AS label, count(*)::int AS value
      FROM audit_logs
      WHERE created_at >= now() - (${windowDays} * interval '1 day')
      GROUP BY resource_type
      ORDER BY value DESC
      LIMIT 10
    `),
      db.execute(sql`
      SELECT e.id, e.name,
        count(DISTINCT m.id)::int AS photos,
        count(DISTINCT m.uploaded_by_id)::int AS uploaders,
        count(DISTINCT a.user_id)::int AS active_users,
        count(a.id)::int AS actions
      FROM events e
      LEFT JOIN media m ON m.event_id = e.id
      LEFT JOIN audit_logs a ON a.details->>'eventId' = e.id::text
        AND a.created_at >= now() - (${windowDays} * interval '1 day')
      GROUP BY e.id, e.name
      ORDER BY actions DESC, photos DESC
      LIMIT 8
    `),
      db.execute(sql`
      SELECT action::text, resource_type, count(*)::int AS value,
        count(DISTINCT user_id)::int AS users
      FROM audit_logs
      WHERE created_at >= now() - (${windowDays} * interval '1 day')
      GROUP BY action, resource_type
      ORDER BY value DESC
      LIMIT 40
    `),
    ]);
  return {
    overview: overviewRows[0],
    activity: activityRows,
    actions: actionsRows,
    events: eventsRows,
    features: featureRows,
  };
}
