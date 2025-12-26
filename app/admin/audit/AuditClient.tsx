"use client";
import { format } from "date-fns";
import { useState, useTransition } from "react";
import { HiCommandLine, HiXMark } from "react-icons/hi2";
import { useDebouncedCallback } from "use-debounce";
import { searchAuditLogs } from "@/app/actions/audit";
import { AdminSearch, AdminToolbar } from "@/components/ui/AdminPageLayout";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
  };
}
function getActionColor(action: string) {
  switch (action) {
    case "create":
    case "upload":
    case "join":
      return "bg-green-500/10 text-green-400 border-green-500/20";
    case "delete":
    case "ban":
    case "leave":
      return "bg-red-600/10 text-red-400 border-red-600/20";
    case "update":
    case "promote":
    case "demote":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  }
}
function getRowColor(action: string) {
  switch (action) {
    case "create":
    case "upload":
    case "join":
      return "bg-green-900/10 hover:bg-green-900/30";
    case "delete":
    case "ban":
    case "leave":
      return "bg-red-900/10 hover:bg-red-900/30";
    case "update":
    case "promote":
    case "demote":
      return "bg-yellow-900/10 hover:bg-yellow-900/30";
    default:
      return "hover:bg-zinc-800/50";
  }
}
function JsonViewer({ data }: { data: any }) {
  if (!data) return <span className="text-zinc-500">null</span>;
  const jsonString = JSON.stringify(data, null, 2);
  const parts = [];
  let lastIndex = 0;
  const regex =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  let match: RegExpExecArray | null = regex.exec(jsonString);
  while (match !== null) {
    const index = match.index;
    if (index > lastIndex) {
      parts.push(jsonString.slice(lastIndex, index));
    }
    const token = match[0];
    let cls = "text-purple-400";
    if (/^"/.test(token)) {
      if (/:$/.test(token)) {
        cls = "text-red-400";
      } else {
        cls = "text-green-400";
      }
    } else if (/true|false/.test(token)) {
      cls = "text-blue-400";
    } else if (/null/.test(token)) {
      cls = "text-zinc-500";
    }
    parts.push(
      <span key={index} className={cls}>
        {token}
      </span>,
    );
    lastIndex = regex.lastIndex;
    match = regex.exec(jsonString);
  }
  if (lastIndex < jsonString.length) {
    parts.push(jsonString.slice(lastIndex));
  }
  return (
    <pre className="text-xs font-mono whitespace-pre-wrap text-zinc-300">
      {parts}
    </pre>
  );
}
export function AuditClient({
  initialLogs,
  totalCount: initialTotalCount,
}: {
  initialLogs: AuditLog[];
  totalCount: number;
}) {
  const [logs, setLogs] = useState(initialLogs);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const handleSearch = useDebouncedCallback((term: string) => {
    setSearchTerm(term);
    startTransition(async () => {
      const result = await searchAuditLogs(term, 0, 50);
      if (result.success && result.logs) {
        setLogs(result.logs);
        if (typeof result.totalCount === "number") {
          setTotalCount(result.totalCount);
        }
      }
    });
  }, 300);
  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    const result = await searchAuditLogs(searchTerm, logs.length, 50);
    if (result.success && result.logs) {
      setLogs((prev) => [...prev, ...result.logs]);
      if (typeof result.totalCount === "number") {
        setTotalCount(result.totalCount);
      }
    }
    setIsLoadingMore(false);
  };
  return (
    <div className="space-y-6">
      <AdminToolbar>
        <AdminSearch
          placeholder="Search logs by action, resource, IP..."
          onChange={(e) => handleSearch(e.target.value)}
        >
          {isPending && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <LoadingSpinner size="sm" />
            </div>
          )}
        </AdminSearch>
      </AdminToolbar>

      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-zinc-400">
          Showing <span className="text-white font-medium">{logs.length}</span>{" "}
          of <span className="text-white font-medium">{totalCount}</span> logs
        </div>
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-12 text-zinc-500"
                >
                  No logs found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={`cursor-pointer ${getRowColor(log.action)}`}
                >
                  <TableCell className="font-mono text-zinc-400">
                    {format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-zinc-200">
                        {log.user.name}
                      </div>
                      <div className="text-sm text-zinc-500 ml-2 hidden sm:block">
                        ({log.user.email})
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full border ${getActionColor(log.action)}`}
                      >
                        {log.action}
                      </span>
                      {log.details?.viaApiKey && (
                        <span
                          className="px-2 py-0.5 text-[10px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 rounded-full uppercase tracking-wider flex items-center gap-1"
                          title={`Via API Key: ${log.details.apiKeyName || "Unnamed"}`}
                        >
                          <HiCommandLine className="w-3 h-3" />
                          API
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-300">
                    <span className="font-medium text-red-400">
                      {log.resourceType}
                    </span>
                    {log.resourceId && (
                      <span className="text-zinc-500 ml-1 font-mono text-xs">
                        {log.resourceId.substring(0, 8)}...
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-400 max-w-xs truncate font-mono">
                    {log.details ? JSON.stringify(log.details) : "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {logs.length < totalCount && (
          <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-center">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoadingMore ? (
                <>
                  <LoadingSpinner size="sm" />
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </button>
          </div>
        )}
      </TableContainer>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900">
              <h3 className="text-lg font-bold text-white flex items-center gap-3">
                Audit Log Details
                <span
                  className={`px-2 py-0.5 text-xs rounded-full border ${getActionColor(selectedLog.action)}`}
                >
                  {selectedLog.action}
                </span>
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <HiXMark className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedLog.details?.viaApiKey && (
                  <div className="col-span-1 md:col-span-2">
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                      API Key Context
                    </h4>
                    <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 flex items-center gap-3">
                      <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
                        <HiCommandLine className="w-5 h-5 text-zinc-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {selectedLog.details.apiKeyName || "Unnamed Key"}
                        </p>
                        <p className="text-xs text-zinc-500 font-mono">
                          ID: {selectedLog.details.apiKeyId}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    User
                  </h4>
                  <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
                    <p className="text-sm text-white font-medium">
                      {selectedLog.user.name}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {selectedLog.user.email}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1 font-mono">
                      ID: {selectedLog.user.id}
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Metadata
                  </h4>
                  <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 space-y-1">
                    <p className="text-xs text-zinc-400">
                      <span className="text-zinc-500">Time:</span>{" "}
                      {format(
                        new Date(selectedLog.createdAt),
                        "yyyy-MM-dd HH:mm:ss",
                      )}
                    </p>
                    <p className="text-xs text-zinc-400">
                      <span className="text-zinc-500">IP:</span>{" "}
                      {selectedLog.ipAddress || "Unknown"}
                    </p>
                    <p className="text-xs text-zinc-400">
                      <span className="text-zinc-500">User Agent:</span>{" "}
                      {selectedLog.userAgent || "Unknown"}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Resource
                </h4>
                <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 flex items-center gap-3">
                  <span className="text-sm font-medium text-red-400">
                    {selectedLog.resourceType}
                  </span>
                  {selectedLog.resourceId && (
                    <span className="text-xs font-mono text-zinc-500 bg-zinc-500/10 border border-zinc-500/20 px-2 py-1 rounded-full">
                      {selectedLog.resourceId}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Details (JSON)
                </h4>
                <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 overflow-x-auto">
                  <JsonViewer data={selectedLog.details} />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-zinc-800 bg-zinc-900 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
