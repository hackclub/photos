"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  HiArrowDownTray,
  HiArrowPath,
  HiCheckCircle,
  HiClock,
  HiExclamationTriangle,
  HiTrash,
  HiXMark,
} from "react-icons/hi2";
import {
  cancelDataExport,
  deleteExport,
  requestDataExport,
} from "@/app/actions/data-export";

interface Export {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  createdAt: Date;
  completedAt: Date | null;
  downloadUrl?: string | null;
}
export default function DataExportClient({
  latestExport,
}: {
  latestExport: Export | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleRequestExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestDataExport();
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to request export");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  const handleCancelExport = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this export?")) return;
    setLoading(true);
    try {
      const result = await cancelDataExport(id);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to cancel export");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  const handleDeleteExport = async (id: string) => {
    if (!confirm("Are you sure you want to delete this export?")) return;
    setLoading(true);
    try {
      const result = await deleteExport(id);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to delete export");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  const isExportExpired =
    latestExport?.completedAt &&
    Date.now() - new Date(latestExport.completedAt).getTime() >
      48 * 60 * 60 * 1000;
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-4">
          Download Your Stuff
        </h1>
        <p className="text-zinc-400 text-lg">
          Want a copy of everything you've done here? We got you. You can
          download all your photos, videos, and profile info in one big zip
          file. It's your data, after all.
        </p>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <HiCheckCircle className="w-6 h-6 text-red-600" />
          What's inside?
        </h2>
        <div className="space-y-4 text-zinc-300">
          <p>
            We'll pack up everything we have on you into a neat little package:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-zinc-400">
            <li>Your profile details & bio</li>
            <li>Every photo & video you uploaded (full original quality!)</li>
            <li>Events you've joined or created</li>
            <li>Your comments, likes, and mentions</li>
            <li>Your API keys and settings</li>
          </ul>
          <p className="text-sm text-zinc-500 mt-4">
            Heads up: For security, the download link self-destructs in 48
            hours. Don't wait too long to grab it! (But don't worry, you can
            always request a new one later).
          </p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-6">
          Export Dashboard
        </h2>

        {error && (
          <div className="mb-6 bg-red-600/10 border border-red-600/20 text-red-600 px-4 py-3 rounded-lg flex items-center gap-2">
            <HiExclamationTriangle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {!latestExport || isExportExpired ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <HiArrowDownTray className="w-8 h-8 text-zinc-400" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              Ready to download?
            </h3>
            <p className="text-zinc-400 mb-6 max-w-md mx-auto">
              We'll compile everything into a ZIP file for you. If you have a
              ton of photos, give us a few minutes to pack it all up.
            </p>
            <button
              onClick={handleRequestExport}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg "
            >
              {loading ? (
                <HiArrowPath className="w-5 h-5 animate-spin" />
              ) : (
                <HiArrowDownTray className="w-5 h-5" />
              )}
              Start Export
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 bg-zinc-950/50 rounded-lg border border-zinc-800">
              <div className="shrink-0 mt-1">
                {latestExport.status === "completed" ? (
                  <HiCheckCircle className="w-6 h-6 text-red-600" />
                ) : latestExport.status === "failed" ||
                  latestExport.status === "cancelled" ? (
                  <HiExclamationTriangle className="w-6 h-6 text-red-600" />
                ) : (
                  <HiArrowPath className="w-6 h-6 text-red-600 animate-spin" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-medium text-white capitalize">
                    {latestExport.status === "processing"
                      ? "Packing your bags..."
                      : latestExport.status === "completed"
                        ? "Your stuff is ready!"
                        : `Export ${latestExport.status}`}
                  </h3>
                  <span className="text-xs text-zinc-500 flex items-center gap-1">
                    <HiClock className="w-3 h-3" />
                    {new Date(latestExport.createdAt).toLocaleDateString()}{" "}
                    {new Date(latestExport.createdAt).toLocaleTimeString()}
                  </span>
                </div>

                <p className="text-sm text-zinc-400 mb-4">
                  {latestExport.status === "pending" &&
                    "You're in line! We'll start processing your export shortly."}
                  {latestExport.status === "processing" &&
                    "We're gathering all your files and zipping them up. Hang tight, this page will update automatically."}
                  {latestExport.status === "completed" &&
                    "Done! Grab your zip file below. Remember, this link expires in 48 hours."}
                  {latestExport.status === "failed" &&
                    "Oof, something broke while packing your data. Give it another shot later."}
                  {latestExport.status === "cancelled" &&
                    "This export was cancelled."}
                </p>

                {latestExport.status === "completed" &&
                  latestExport.downloadUrl && (
                    <div className="flex gap-2">
                      <a
                        href={latestExport.downloadUrl}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg "
                      >
                        <HiArrowDownTray className="w-4 h-4" />
                        Download ZIP
                      </a>
                      <button
                        onClick={() => handleDeleteExport(latestExport.id)}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg text-sm font-medium transition-colors border border-zinc-700"
                      >
                        <HiTrash className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  )}

                {(latestExport.status === "pending" ||
                  latestExport.status === "processing") && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCancelExport(latestExport.id)}
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg text-sm font-medium transition-colors border border-zinc-700"
                    >
                      <HiXMark className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                )}

                {(latestExport.status === "failed" ||
                  latestExport.status === "cancelled") && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleRequestExport}
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg "
                    >
                      {loading ? (
                        <HiArrowPath className="w-4 h-4 animate-spin" />
                      ) : (
                        <HiArrowPath className="w-4 h-4" />
                      )}
                      Try Again
                    </button>
                    <button
                      onClick={() => handleDeleteExport(latestExport.id)}
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg text-sm font-medium transition-colors border border-zinc-700"
                    >
                      <HiTrash className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>

            {(latestExport.status === "pending" ||
              latestExport.status === "processing") && (
              <div className="text-center">
                <button
                  onClick={() => router.refresh()}
                  className="text-sm text-zinc-500 hover:text-white transition-colors flex items-center gap-1 mx-auto"
                >
                  <HiArrowPath className="w-3 h-3" />
                  Check status
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
