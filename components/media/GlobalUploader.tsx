"use client";
import {
  HiArrowUpTray,
  HiCheck,
  HiChevronDown,
  HiChevronUp,
  HiExclamationCircle,
  HiPhoto,
  HiXMark,
} from "react-icons/hi2";
import { useUpload } from "@/components/providers/UploadProvider";
export default function GlobalUploader() {
  const {
    files,
    isMinimized,
    setIsMinimized,
    cancelUpload,
    clearCompleted,
    error,
    setError,
    uploadSpeed,
    timeRemaining,
  } = useUpload();
  const activeCount = files.filter(
    (f) => f.status === "uploading" || f.status === "processing",
  ).length;
  const processingCount = files.filter((f) => f.status === "processing").length;
  const successCount = files.filter((f) => f.status === "success").length;
  const totalCount = files.length;
  const overallProgress =
    totalCount > 0
      ? Math.round(files.reduce((acc, f) => acc + f.progress, 0) / totalCount)
      : 0;
  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec === 0) return "";
    const mbps = bytesPerSec / (1024 * 1024);
    return `${mbps.toFixed(1)} MB/s`;
  };
  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "";
    if (seconds < 60) return `${seconds}s left`;
    const mins = Math.floor(seconds / 60);
    return `${mins}m left`;
  };
  if (files.length === 0 && !error) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-md">
      {error && (
        <div className="mb-4 bg-zinc-900 border border-red-600/50 rounded-xl p-4 shadow-2xl flex items-start gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <HiExclamationCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-red-400 font-medium mb-1">Upload Failed</h3>
            <p className="text-red-300 text-sm">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 transition-colors"
          >
            <HiXMark className="w-5 h-5" />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div
            className="p-4 bg-zinc-800/50 flex items-center justify-between cursor-pointer hover:bg-zinc-800 transition-colors"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            <div className="flex items-center gap-3">
              {activeCount > 0 ? (
                <div className="w-8 h-8 bg-red-600/20 rounded-full flex items-center justify-center animate-pulse">
                  <HiArrowUpTray className="w-5 h-5 text-red-400" />
                </div>
              ) : (
                <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
                  <HiCheck className="w-5 h-5 text-green-400" />
                </div>
              )}
              <div>
                <h3 className="font-medium text-white text-sm">
                  {activeCount > 0
                    ? processingCount > 0 && activeCount === processingCount
                      ? `Processing ${processingCount} files...`
                      : `Uploading ${activeCount} files...`
                    : "Upload Complete"}
                </h3>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>
                    {successCount} of {totalCount} done ({overallProgress}%)
                  </span>
                  {activeCount > 0 && uploadSpeed > 0 && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-zinc-600" />
                      <span className="text-zinc-300">
                        {formatSpeed(uploadSpeed)}
                      </span>
                      {timeRemaining !== null && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-zinc-600" />
                          <span>{formatTime(timeRemaining)}</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isMinimized ? (
                <HiChevronUp className="w-5 h-5 text-zinc-400" />
              ) : (
                <HiChevronDown className="w-5 h-5 text-zinc-400" />
              )}
            </div>
          </div>

          {!isMinimized && (
            <div className="max-h-64 overflow-y-auto p-4 border-t border-zinc-800">
              <div className="mb-4">
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ease-out ${
                      activeCount > 0
                        ? "bg-linear-to-r from-red-500 to-red-600"
                        : "bg-green-500"
                    }`}
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/30"
                  >
                    <div className="w-10 h-10 bg-zinc-800 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                      <HiPhoto className="w-5 h-5 text-zinc-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">
                        {file.file.name}
                      </p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-zinc-500">
                          {(file.file.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <span
                          className={`text-xs ${
                            file.status === "error"
                              ? "text-red-400"
                              : file.status === "success"
                                ? "text-green-400"
                                : "text-zinc-400"
                          }`}
                        >
                          {file.status === "error"
                            ? "Failed"
                            : file.status === "success"
                              ? "Done"
                              : file.status === "processing"
                                ? "Processing (Server)..."
                                : `${file.progress}%`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-4 border-t border-zinc-800">
                {activeCount > 0 ? (
                  <button
                    onClick={cancelUpload}
                    className="text-xs font-medium text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-700/10 transition-colors"
                  >
                    Cancel Upload
                  </button>
                ) : (
                  <button
                    onClick={clearCompleted}
                    className="text-xs font-medium text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
