"use client";

import { startTransition, useState } from "react";
import {
  HiArrowTrendingUp,
  HiChartBar,
  HiFaceSmile,
  HiPhoto,
  HiShieldCheck,
  HiUsers,
} from "react-icons/hi2";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getAnalyticsData } from "@/app/actions/analytics";

export type AnalyticsData = {
  overview: {
    users: number;
    active_users_30d: number;
    events: number;
    photos: number;
    uploaded_bytes: number;
    face_scans: number;
    face_matching_enabled: number;
    active_blur_subscriptions: number;
    deleted_profiles: number;
    uploads_30d: number;
    event_joins: number;
    downloads: number;
    exports: number;
    shares: number;
    reports: number;
    blur_opt_ins: number;
    automatic_blurs: number;
  };
  activity: {
    day: string;
    users: number;
    uploads: number;
    searches: number;
    scans: number;
    blur_requests: number;
  }[];
  features: {
    action: string;
    resource_type: string;
    value: number;
    users: number;
  }[];
  actions: { label: string; value: number }[];
  events: {
    id: string;
    name: string;
    photos: number;
    uploaders: number;
    active_users: number;
    actions: number;
  }[];
};

const colors = [
  "#f43f5e",
  "#38bdf8",
  "#a78bfa",
  "#fbbf24",
  "#34d399",
  "#fb7185",
];

function number(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value));
}

function bytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** exponent).toFixed(exponent > 1 ? 1 : 0)} ${units[exponent]}`;
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof HiUsers;
  color: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div
        className={`absolute -right-5 -top-5 h-24 w-24 rounded-full blur-2xl ${color}`}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-400">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-white">
            {value}
          </p>
          <p className="mt-2 text-xs text-zinc-500">{detail}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsClient({
  initialData,
}: {
  initialData: AnalyticsData;
}) {
  const [data, setData] = useState(initialData);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const selectWindow = (nextDays: number) => {
    setDays(nextDays);
    setLoading(true);
    startTransition(async () => {
      try {
        setData((await getAnalyticsData(nextDays)) as unknown as AnalyticsData);
      } finally {
        setLoading(false);
      }
    });
  };
  const { overview } = data;
  const faceAdoption = overview.users
    ? Math.round((overview.face_matching_enabled / overview.users) * 100)
    : 0;
  const activityTotal = data.actions.reduce(
    (sum, item) => sum + Number(item.value),
    0,
  );
  const featureData = [
    { label: "Face scans", value: overview.face_scans },
    { label: "Face matching on", value: overview.face_matching_enabled },
    { label: "Auto blur on", value: overview.active_blur_subscriptions },
  ];
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,_rgba(244,63,94,0.2),_transparent_35%),radial-gradient(circle_at_85%_20%,_rgba(56,189,248,0.12),_transparent_28%),#09090b] p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-rose-300">
              First-party intelligence
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-tight text-white sm:text-4xl">
              How your community actually uses Photos.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
              Every chart combines durable product records with the audit trail,
              so it measures meaningful actions rather than anonymous pageviews.
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
              {[7, 30, 90, 365].map((window) => (
                <button
                  type="button"
                  key={window}
                  onClick={() => selectWindow(window)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${days === window ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}
                >
                  {window === 365 ? "1Y" : `${window}D`}
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-5 py-4">
              <p className="text-xs font-medium text-rose-200">
                Face matching adoption
              </p>
              <p className="mt-1 text-3xl font-black text-white">
                {faceAdoption}%
              </p>
              <p className="mt-1 text-xs text-rose-200/70">
                {number(overview.face_matching_enabled)} users opted in
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Active users"
          value={number(overview.active_users_30d)}
          detail="Unique people acting in 30 days"
          icon={HiUsers}
          color="bg-sky-500/20"
        />
        <Metric
          label="Photos uploaded"
          value={number(overview.uploads_30d)}
          detail={`${bytes(overview.uploaded_bytes)} stored across all time`}
          icon={HiPhoto}
          color="bg-rose-500/20"
        />
        <Metric
          label="Face searches"
          value={number(
            data.activity.reduce((sum, day) => sum + Number(day.searches), 0),
          )}
          detail={`${number(overview.face_scans)} active face scans`}
          icon={HiFaceSmile}
          color="bg-violet-500/20"
        />
        <Metric
          label="Privacy coverage"
          value={number(overview.active_blur_subscriptions)}
          detail="People with automatic blurring active"
          icon={HiShieldCheck}
          color="bg-emerald-500/20"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Event joins", overview.event_joins, "People joining events"],
          ["Downloads", overview.downloads, "Media retrieved"],
          ["Share links", overview.shares, "Links created"],
          [
            "Auto privacy blurs",
            overview.automatic_blurs,
            "Applied immediately",
          ],
          [
            "New blur opt-ins",
            overview.blur_opt_ins,
            "Automatic protection enabled",
          ],
          ["Data exports", overview.exports, "Privacy exports requested"],
          ["Reports", overview.reports, "Moderation reports opened"],
          [
            "Profile deletions",
            overview.deleted_profiles,
            "Lifetime deletion count",
          ],
        ].map(([label, value, detail]) => (
          <div
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
            key={label as string}
          >
            <p className="text-xs font-medium text-zinc-500">{label}</p>
            <p className="mt-1 text-xl font-black text-white">
              {number(value as number)}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">{detail as string}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <div
          className={`rounded-2xl border border-zinc-800 bg-zinc-950 p-5 transition-opacity sm:p-6 ${loading ? "opacity-50" : ""}`}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-white">Community pulse</h3>
              <p className="mt-1 text-sm text-zinc-500">
                Daily unique actors and uploads, last {days} days.
              </p>
            </div>
            <HiArrowTrendingUp className="h-5 w-5 text-rose-400" />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.activity}>
                <defs>
                  <linearGradient id="users" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="uploads" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="#27272a"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval={5}
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: 12,
                  }}
                  labelStyle={{ color: "#fafafa" }}
                />
                <Area
                  type="monotone"
                  dataKey="users"
                  name="Active users"
                  stroke="#38bdf8"
                  fill="url(#users)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="uploads"
                  name="Uploads"
                  stroke="#f43f5e"
                  fill="url(#uploads)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
          <h3 className="font-bold text-white">Feature footprint</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Current opted-in product use.
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={featureData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={55}
                  outerRadius={82}
                  paddingAngle={4}
                >
                  {featureData.map((item, index) => (
                    <Cell key={item.label} fill={colors[index]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {featureData.map((item, index) => (
              <div
                className="flex items-center justify-between text-sm"
                key={item.label}
              >
                <span className="flex items-center gap-2 text-zinc-400">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: colors[index] }}
                  />
                  {item.label}
                </span>
                <strong className="text-white">{number(item.value)}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white">What people do</h3>
              <p className="mt-1 text-sm text-zinc-500">
                Top audited resource types in 30 days.
              </p>
            </div>
            <HiChartBar className="h-5 w-5 text-violet-400" />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.actions}
                layout="vertical"
                margin={{ left: 20 }}
              >
                <CartesianGrid horizontal={false} stroke="#27272a" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: "#a1a1aa", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={100}
                />
                <Tooltip
                  cursor={{ fill: "#27272a" }}
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: 12,
                  }}
                />
                <Bar
                  dataKey="value"
                  name="Actions"
                  radius={[0, 6, 6, 0]}
                  fill="#a78bfa"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            {number(activityTotal)} audited actions captured in this window.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
          <div className="mb-5">
            <h3 className="font-bold text-white">Event activity board</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Events ranked by audited activity over the last {days} days.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="pb-3 font-medium">Event</th>
                  <th className="pb-3 text-right font-medium">Actions</th>
                  <th className="pb-3 text-right font-medium">Active</th>
                  <th className="pb-3 text-right font-medium">Uploaders</th>
                  <th className="pb-3 text-right font-medium">Photos</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((event) => (
                  <tr
                    className="border-b border-zinc-900 last:border-0"
                    key={event.id}
                  >
                    <td className="py-4 font-semibold text-zinc-200">
                      {event.name}
                    </td>
                    <td className="py-4 text-right text-rose-300">
                      {number(event.actions)}
                    </td>
                    <td className="py-4 text-right text-sky-300">
                      {number(event.active_users)}
                    </td>
                    <td className="py-4 text-right text-zinc-300">
                      {number(event.uploaders)}
                    </td>
                    <td className="py-4 text-right text-zinc-500">
                      {number(event.photos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-white">Complete feature activity</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Every audited action and resource pair in the selected window.
            </p>
          </div>
          <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-bold text-zinc-400">
            {data.features.length} signals
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {data.features.map((feature) => (
            <div
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3"
              key={`${feature.action}-${feature.resource_type}`}
            >
              <p className="truncate text-sm font-bold text-zinc-200">
                {feature.resource_type.replaceAll("_", " ")}
              </p>
              <div className="mt-2 flex items-end justify-between">
                <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                  {feature.action}
                </span>
                <strong className="text-lg text-white">
                  {number(feature.value)}
                </strong>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {number(feature.users)} unique users
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <p className="text-sm text-zinc-500">Average uploads per user</p>
          <p className="mt-2 text-2xl font-black text-white">
            {overview.users
              ? (overview.photos / overview.users).toFixed(1)
              : "0"}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Lifetime photo contribution
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <p className="text-sm text-zinc-500">Account deletions</p>
          <p className="mt-2 text-2xl font-black text-white">
            {number(overview.deleted_profiles)}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Recorded deleted profiles
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <p className="text-sm text-zinc-500">Event coverage</p>
          <p className="mt-2 text-2xl font-black text-white">
            {number(overview.events)}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Events, {number(overview.photos)} photos total
          </p>
        </div>
      </section>
    </div>
  );
}
