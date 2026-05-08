"use client";
import { useState } from "react";
import { HiExclamationTriangle, HiXMark } from "react-icons/hi2";
import { createReport } from "@/app/actions/reports";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface ReportModalProps {
  mediaId: string;
  isOpen: boolean;
  onClose: () => void;
}
export default function ReportModal({
  mediaId,
  isOpen,
  onClose,
}: ReportModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  if (!isOpen) return null;
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await createReport(mediaId, reason);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setReason("");
        }, 2000);
      } else {
        setError(result.error || "Failed to submit report");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-md space-y-6 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <HiXMark className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 text-red-600">
          <HiExclamationTriangle className="w-6 h-6" />
          <h3 className="text-xl font-bold text-white">Report Photo</h3>
        </div>

        {success ? (
          <div className="text-center py-8 space-y-2">
            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto text-green-500 mb-4">
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
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
            <p className="text-white font-medium">Report Submitted</p>
            <p className="text-zinc-400 text-sm">
              Thank you for keeping our community safe. Admins will review this
              shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-zinc-400 text-sm">
              Please describe why you are reporting this photo. This will be
              sent to the admins for review.
            </p>

            <div className="space-y-2">
              <label
                htmlFor="reason"
                className="text-xs font-medium text-zinc-400 uppercase tracking-wider"
              >
                Reason
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Inappropriate content, spam, harassment..."
                className="h-32 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-white placeholder-zinc-500 transition-all focus:border-red-600 focus:outline-none"
                required
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 flex-1 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !reason.trim()}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {submitting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Sending...</span>
                  </>
                ) : (
                  "Submit Report"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
