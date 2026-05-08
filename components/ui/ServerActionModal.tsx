"use client";
import Image from "next/image";
import LoadingQuip from "@/components/ui/LoadingQuip";

interface ServerActionModalProps {
  isOpen: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  title: string;
  message?: string;
  successTitle?: string;
  successMessage?: string;
  type?: "download" | "delete" | "upload";
  progress?: {
    current: number;
    total: number;
  } | null;
  onClose?: () => void;
}
export default function ServerActionModal({
  isOpen,
  isLoading,
  isSuccess,
  title,
  message,
  successTitle = "Success!",
  successMessage = "Operation completed successfully.",
  type = "download",
  progress,
  onClose,
}: ServerActionModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
      <div className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl sm:p-12">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 sm:right-4 sm:top-4"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <title>Close</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
        <div className="text-center mb-8">
          <h2 className="mb-2 text-2xl font-bold text-white sm:text-3xl">
            {isSuccess ? successTitle : title}
          </h2>
          <p className="text-zinc-400">
            {isSuccess ? successMessage : message}
          </p>
          {progress && (
            <p className="text-sm text-zinc-500 mt-2">
              {progress.current} files processed
            </p>
          )}
        </div>

        {!isSuccess && (
          <div className="flex justify-center mb-8">
            <Image
              src="/heidi-run-optimized.gif"
              alt="Loading..."
              width={200}
              height={112}
              style={{ height: "auto" }}
              unoptimized
            />
          </div>
        )}

        {!isSuccess && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-8">
            <LoadingQuip
              type={type}
              className="text-center text-xl font-medium leading-relaxed text-zinc-200 md:text-3xl"
            />
          </div>
        )}

        {isSuccess && (
          <div className="text-center mt-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <title>Success</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-green-400 font-semibold text-lg">
              {successTitle}
            </p>
          </div>
        )}

        {onClose && !isSuccess && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={onClose}
              className="min-h-11 rounded-xl px-4 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
