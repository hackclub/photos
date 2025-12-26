"use client";
import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { formatBytes } from "@/lib/format";

interface StorageStats {
  totalSize: number;
  totalFiles: number;
  breakdown: {
    events: {
      size: number;
      count: number;
    };
    thumbnails: {
      size: number;
      count: number;
    };
    avatars: {
      size: number;
      count: number;
    };
    exports: {
      size: number;
      count: number;
    };
    banners: {
      size: number;
      count: number;
    };
    other: {
      size: number;
      count: number;
    };
  };
  eventBreakdown: {
    id: string;
    name: string;
    size: number;
    count: number;
  }[];
  userBreakdown: {
    id: string;
    name: string;
    size: number;
    count: number;
    storageLimit: number;
    isGlobalAdmin: boolean;
  }[];
}
interface StorageClientProps {
  stats: StorageStats;
}
const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#8b5cf6",
  "#10b981",
  "#3b82f6",
];
export default function StorageClient({ stats }: StorageClientProps) {
  const sizeData = [
    { name: "Events", value: stats.breakdown.events.size },
    { name: "Thumbnails", value: stats.breakdown.thumbnails.size },
    { name: "Avatars", value: stats.breakdown.avatars.size },
    { name: "Exports", value: stats.breakdown.exports.size },
    { name: "Banners", value: stats.breakdown.banners.size },
    { name: "Other", value: stats.breakdown.other.size },
  ];
  const countData = [
    { name: "Events", value: stats.breakdown.events.count },
    { name: "Thumbnails", value: stats.breakdown.thumbnails.count },
    { name: "Avatars", value: stats.breakdown.avatars.count },
    { name: "Exports", value: stats.breakdown.exports.count },
    { name: "Banners", value: stats.breakdown.banners.count },
    { name: "Other", value: stats.breakdown.other.count },
  ];
  const topEvents = [...stats.eventBreakdown]
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);
  const topUsers = [...stats.userBreakdown]
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);
  return (
    <div className="space-y-8">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-white">Storage Usage</h3>
            <CleanupButton />
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-white">
              {formatBytes(stats.totalSize)}
            </p>
            <p className="text-sm text-zinc-400">
              {stats.totalFiles.toLocaleString()} files total
            </p>
          </div>
        </div>

        <div className="h-8 w-full bg-zinc-800 rounded-full overflow-hidden flex mb-6">
          {sizeData.map((item, index) => {
            const percentage = (item.value / stats.totalSize) * 100;
            if (percentage < 0.5) return null;
            return (
              <div
                key={item.name}
                style={{
                  width: `${percentage}%`,
                  backgroundColor: COLORS[index % COLORS.length],
                }}
                className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-500 hover:opacity-80 relative group"
              >
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-zinc-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 border border-zinc-700">
                  {item.name}: {formatBytes(item.value)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-6">
          {sizeData.map((item, index) => (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <div className="text-sm">
                <span className="text-zinc-300 font-medium">{item.name}</span>
                <span className="text-zinc-500 ml-2">
                  {formatBytes(item.value)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">
            Storage Distribution
          </h3>
          <div className="h-75 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sizeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {sizeData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number | undefined) => [
                    formatBytes(value || 0),
                    "Size",
                  ]}
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    color: "#fff",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">
            File Count Distribution
          </h3>
          <div className="h-75 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countData}>
                <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} />
                <Tooltip
                  cursor={{ fill: "#27272a" }}
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    color: "#fff",
                  }}
                />
                <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]}>
                  {countData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-bold text-white">Events Breakdown</h2>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Top Events Usage
            </h3>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">
                {formatBytes(stats.breakdown.events.size)}
              </p>
              <p className="text-sm text-zinc-400">Total Event Storage</p>
            </div>
          </div>

          <div className="h-8 w-full bg-zinc-800 rounded-full overflow-hidden flex mb-6">
            {topEvents.map((event, index) => {
              const percentage =
                (event.size / stats.breakdown.events.size) * 100;
              if (percentage < 1) return null;
              return (
                <div
                  key={event.id}
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: COLORS[index % COLORS.length],
                  }}
                  className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-500 hover:opacity-80 relative group"
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-zinc-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 border border-zinc-700">
                    {event.name}: {formatBytes(event.size)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-6">
            {topEvents.slice(0, 5).map((event, index) => (
              <div key={event.id} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <div className="text-sm">
                  <span className="text-zinc-300 font-medium">
                    {event.name}
                  </span>
                  <span className="text-zinc-500 ml-2">
                    {formatBytes(event.size)}
                  </span>
                </div>
              </div>
            ))}
            {topEvents.length > 5 && (
              <div className="text-sm text-zinc-500 flex items-center">
                + {topEvents.length - 5} more...
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6">
              Events Storage Distribution
            </h3>
            <div className="h-75 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topEvents}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="size"
                  >
                    {topEvents.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | undefined) => [
                      formatBytes(value || 0),
                      "Size",
                    ]}
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderColor: "#27272a",
                      color: "#fff",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6">
              Top 10 Events by Storage
            </h3>
            <div className="h-75 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topEvents}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#71717a"
                    fontSize={12}
                    width={150}
                  />
                  <Tooltip
                    formatter={(value: number | undefined) => [
                      formatBytes(value || 0),
                      "Size",
                    ]}
                    cursor={{ fill: "#27272a" }}
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderColor: "#27272a",
                      color: "#fff",
                    }}
                  />
                  <Bar dataKey="size" fill="#ef4444" radius={[0, 4, 4, 0]}>
                    {topEvents.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Category Breakdown</h3>
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Avg. File Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sizeData.map((item, index) => {
                const count = countData[index].value;
                const avgSize = count > 0 ? item.value / count : 0;
                return (
                  <TableRow key={item.name}>
                    <TableCell className="font-medium text-white">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index] }}
                        />
                        {item.name}
                      </div>
                    </TableCell>
                    <TableCell>{formatBytes(item.value)}</TableCell>
                    <TableCell>{count.toLocaleString()}</TableCell>
                    <TableCell>{formatBytes(avgSize)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">
          Event Storage Breakdown
        </h3>
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Avg. File Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topEvents.map((event) => {
                const avgSize = event.count > 0 ? event.size / event.count : 0;
                return (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium text-white">
                      {event.name}
                    </TableCell>
                    <TableCell>{formatBytes(event.size)}</TableCell>
                    <TableCell>{event.count.toLocaleString()}</TableCell>
                    <TableCell>{formatBytes(avgSize)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-bold text-white">Users Breakdown</h2>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Top Users Usage
            </h3>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">
                {formatBytes(
                  stats.userBreakdown.reduce((acc, u) => acc + u.size, 0),
                )}
              </p>
              <p className="text-sm text-zinc-400">Total User Storage</p>
            </div>
          </div>

          <div className="h-8 w-full bg-zinc-800 rounded-full overflow-hidden flex mb-6">
            {topUsers.map((user, index) => {
              const totalUserSize = stats.userBreakdown.reduce(
                (acc, u) => acc + u.size,
                0,
              );
              const percentage = (user.size / totalUserSize) * 100;
              if (percentage < 1) return null;
              return (
                <div
                  key={user.id}
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: COLORS[index % COLORS.length],
                  }}
                  className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-500 hover:opacity-80 relative group"
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-zinc-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 border border-zinc-700">
                    {user.name}: {formatBytes(user.size)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-6">
            {topUsers.slice(0, 5).map((user, index) => (
              <div key={user.id} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <div className="text-sm">
                  <span className="text-zinc-300 font-medium">{user.name}</span>
                  <span className="text-zinc-500 ml-2">
                    {formatBytes(user.size)}
                  </span>
                </div>
              </div>
            ))}
            {topUsers.length > 5 && (
              <div className="text-sm text-zinc-500 flex items-center">
                + {topUsers.length - 5} more...
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6">
              Users Storage Distribution
            </h3>
            <div className="h-75 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topUsers}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="size"
                  >
                    {topUsers.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | undefined) => [
                      formatBytes(value || 0),
                      "Size",
                    ]}
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderColor: "#27272a",
                      color: "#fff",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6">
              Top 10 Users by Storage
            </h3>
            <div className="h-75 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topUsers}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#71717a"
                    fontSize={12}
                    width={150}
                  />
                  <Tooltip
                    formatter={(value: number | undefined) => [
                      formatBytes(value || 0),
                      "Size",
                    ]}
                    cursor={{ fill: "#27272a" }}
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderColor: "#27272a",
                      color: "#fff",
                    }}
                  />
                  <Bar dataKey="size" fill="#ef4444" radius={[0, 4, 4, 0]}>
                    {topUsers.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">
            User Storage Breakdown
          </h3>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User Name</TableHead>
                  <TableHead>Usage / Limit</TableHead>
                  <TableHead>Files</TableHead>
                  <TableHead>Avg. File Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topUsers.map((user) => {
                  const avgSize = user.count > 0 ? user.size / user.count : 0;
                  const limit = user.storageLimit;
                  const isUnlimited = limit === -1 || user.isGlobalAdmin;
                  const percentage = isUnlimited
                    ? 0
                    : Math.min(100, (user.size / limit) * 100);
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium text-white">
                        {user.name}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">
                              {formatBytes(user.size)}
                            </span>
                            <span className="text-zinc-500">/</span>
                            <span className="text-zinc-400">
                              {isUnlimited ? "Unlimited" : formatBytes(limit)}
                            </span>
                          </div>
                          {!isUnlimited && (
                            <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  percentage > 90
                                    ? "bg-red-600"
                                    : percentage > 75
                                      ? "bg-yellow-500"
                                      : "bg-green-500"
                                }`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{user.count.toLocaleString()}</TableCell>
                      <TableCell>{formatBytes(avgSize)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      </div>
    </div>
  );
}
function CleanupButton() {
  const [isCleaning, setIsCleaning] = useState(false);
  const [progress, setProgress] = useState<{
    checked: number;
    deleted: number;
  } | null>(null);

  const handleCleanup = async () => {
    if (
      !confirm(
        "Are you sure you want to scan for and delete ghost files? This may take a few minutes.",
      )
    ) {
      return;
    }
    setIsCleaning(true);
    setProgress({ checked: 0, deleted: 0 });

    try {
      const { cleanupGhostFiles } = await import("@/app/actions/storage");
      let cursor: string | undefined;
      let totalChecked = 0;
      let totalDeleted = 0;
      let completed = false;

      while (!completed) {
        const result = await cleanupGhostFiles(cursor);
        if (!result.success) {
          throw new Error(result.error);
        }

        totalChecked += result.checked;
        totalDeleted += result.deleted;
        setProgress({ checked: totalChecked, deleted: totalDeleted });

        if (result.completed) {
          completed = true;
        } else {
          cursor = result.nextCursor;
        }
      }

      alert(
        `Cleanup complete!\nChecked: ${totalChecked} files\nDeleted: ${totalDeleted} ghost files`,
      );
      window.location.reload();
    } catch (error) {
      console.error("Cleanup error:", error);
      alert(
        `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsCleaning(false);
      setProgress(null);
    }
  };

  return (
    <button
      onClick={handleCleanup}
      disabled={isCleaning}
      className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
    >
      {isCleaning ? (
        <>
          <span className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
          {progress
            ? `Cleaning (${progress.checked} checked)...`
            : "Cleaning..."}
        </>
      ) : (
        "Cleanup Ghost Files"
      )}
    </button>
  );
}
