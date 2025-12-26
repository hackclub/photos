"use client";
import { useRef, useState } from "react";
import { HiArrowDownTray } from "react-icons/hi2";
import ServerActionModal from "@/components/ui/ServerActionModal";

interface Props {
  eventId: string;
  eventName: string;
  mediaCount: number;
  isAdmin: boolean;
}
export default function DownloadAllButton({
  eventId,
  eventName,
  mediaCount,
  isAdmin,
}: Props) {
  const [preparing, setPreparing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  if (!isAdmin) return null;
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setPreparing(false);
    setDownloading(false);
    setCompleted(false);
    setError(null);
    setProgress(null);
  };
  const handleDownload = async () => {
    setPreparing(true);
    setCompleted(false);
    setError(null);
    setProgress(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const prepareResponse = await fetch(
        `/api/events/${eventId}/download/prepare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaIds: null }),
          signal: controller.signal,
        },
      );
      if (!prepareResponse.ok) {
        const data = await prepareResponse.json();
        setError(data.error || "Failed to prepare download");
        return;
      }
      const { downloadId, fileCount } = await prepareResponse.json();
      setProgress({ current: fileCount, total: fileCount });
      setPreparing(false);
      setDownloading(true);
      const a = document.createElement("a");
      a.href = `/api/events/${eventId}/download/${downloadId}`;
      a.download = `${eventName.toLowerCase().replace(/\s+/g, "-")}-photos.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => {
        setCompleted(true);
        setDownloading(false);
      }, 1500);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.error("Download error:", err);
      setError("Failed to download files. Please try again.");
      setPreparing(false);
      setDownloading(false);
    } finally {
      abortControllerRef.current = null;
      if (!error) {
        setTimeout(() => {
          setPreparing(false);
          setDownloading(false);
          setCompleted(false);
        }, 3000);
      }
    }
  };
  return (
    <>
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all border border-zinc-700 hover:border-zinc-700"
        >
          <HiArrowDownTray className="w-5 h-5" />
          <span>Download All ({mediaCount})</span>
        </button>
        {error && (
          <p className="text-sm text-red-400 max-w-xs text-right">{error}</p>
        )}
        {!error && !downloading && (
          <p className="text-xs text-zinc-400">
            Up to 10,000 files/50GB • 3 downloads per hour
          </p>
        )}
      </div>

      <ServerActionModal
        isOpen={preparing || downloading || completed}
        isLoading={preparing || downloading}
        isSuccess={completed}
        title={preparing ? "Preparing Download" : "Downloading Files"}
        message={
          preparing
            ? "Creating ZIP file on server..."
            : "Your download should start automatically..."
        }
        successTitle="Download Ready"
        successMessage="Your download is ready!"
        type="download"
        progress={progress}
        onClose={handleCancel}
      />
    </>
  );
}
