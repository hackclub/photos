"use client";
import { useEffect, useState } from "react";
import {
  HiCheckCircle,
  HiClock,
  HiExclamationTriangle,
  HiPhoto,
  HiXCircle,
} from "react-icons/hi2";
import { getUserReports } from "@/app/actions/reports";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface Report {
  id: string;
  reason: string;
  status: "pending" | "resolved" | "ignored";
  createdAt: Date;
  resolutionNotes?: string | null;
  media: {
    id: string;
    filename: string;
  };
}
export default function UserReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchReports = async () => {
      try {
        const result = await getUserReports();
        if (result.success && result.reports) {
          setReports(result.reports as any);
        }
      } catch (error) {
        console.error("Error fetching reports:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }
  if (reports.length === 0) {
    return (
      <div className="text-center py-12 bg-zinc-900 rounded-xl border border-zinc-800">
        <HiExclamationTriangle className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">No reports</h3>
        <p className="text-zinc-400">You haven't submitted any reports.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {reports.map((report) => (
        <div
          key={report.id}
          className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex gap-4"
        >
          <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0 border border-zinc-700">
            <HiPhoto className="w-6 h-6 text-zinc-600" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <p className="text-sm font-medium text-white truncate">
                  Report on{" "}
                  {report.media ? report.media.filename : "Deleted Media"}
                </p>
                <p className="text-xs text-zinc-500">
                  {new Date(report.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <StatusBadge status={report.status} />
            </div>

            <div className="bg-zinc-950/50 rounded-lg p-2 text-sm text-zinc-300 border border-zinc-800/50">
              <span className="text-zinc-500 text-xs uppercase tracking-wider font-bold mr-2">
                Reason
              </span>
              {report.reason}
            </div>

            {report.resolutionNotes && (
              <div className="mt-2 p-2 bg-zinc-800/50 rounded-lg text-sm text-zinc-400 border border-zinc-700/50">
                <span className="text-zinc-500 text-xs uppercase tracking-wider font-bold mr-2">
                  Admin Note
                </span>
                {report.resolutionNotes}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  if (status === "resolved") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-medium border border-green-500/20">
        <HiCheckCircle className="w-3 h-3" />
        Resolved
      </span>
    );
  }
  if (status === "ignored") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-500/10 text-zinc-400 text-xs font-medium border border-zinc-500/20">
        <HiXCircle className="w-3 h-3" />
        Ignored
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-xs font-medium border border-yellow-500/20">
      <HiClock className="w-3 h-3" />
      Pending
    </span>
  );
}
