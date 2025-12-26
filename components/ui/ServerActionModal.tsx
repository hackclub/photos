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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 max-w-2xl w-full relative shadow-2xl">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors"
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
          <h2 className="text-3xl font-bold text-white mb-2">
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
          <div className="bg-zinc-900/50 rounded-lg p-8 border border-zinc-800">
            <LoadingQuip
              type={type}
              className="text-2xl md:text-3xl text-zinc-200 text-center leading-relaxed font-medium"
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
              className="text-zinc-500 hover:text-zinc-300 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
