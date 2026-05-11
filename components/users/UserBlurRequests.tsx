"use client";
import { useEffect, useState } from "react";
import { HiCheckCircle, HiClock, HiEyeSlash, HiXCircle } from "react-icons/hi2";
import { getUserBlurRequests } from "@/app/actions/blur-requests";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

type Request = {
  id: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  media: { filename: string } | null;
};

export default function UserBlurRequests() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void getUserBlurRequests().then((result) => {
      if (result.success && result.requests)
        setRequests(result.requests as Request[]);
      setLoading(false);
    });
  }, []);
  if (loading)
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 py-12 text-center">
        <HiEyeSlash className="mx-auto mb-4 h-12 w-12 text-zinc-700" />
        <h3 className="mb-2 text-xl font-semibold text-white">
          No blur requests
        </h3>
        <p className="text-zinc-400">
          You haven't submitted any blur requests.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {requests.map((request) => (
        <div
          key={request.id}
          className="flex gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800">
            <HiEyeSlash className="h-6 w-6 text-zinc-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="truncate text-sm font-medium text-white">
                  Blur request for {request.media?.filename || "Deleted media"}
                </p>
                <p className="text-xs text-zinc-500">
                  {new Date(request.createdAt).toLocaleString()}
                </p>
              </div>
              <Status status={request.status} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Status({ status }: { status: string }) {
  if (status === "approved")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400">
        <HiCheckCircle className="h-3 w-3" />
        Approved
      </span>
    );
  if (status === "rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2 py-1 text-xs font-medium text-zinc-400">
        <HiXCircle className="h-3 w-3" />
        Rejected
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-xs font-medium text-yellow-400">
      <HiClock className="h-3 w-3" />
      Pending
    </span>
  );
}
