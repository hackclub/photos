"use client";
import { type ReactNode, useEffect, useState } from "react";
import { HiExclamationTriangle, HiXMark } from "react-icons/hi2";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  timerSeconds?: number;
  confirmButtonClass?: string;
  disabled?: boolean;
}
export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = true,
  timerSeconds = 3,
  confirmButtonClass,
  disabled = false,
}: ConfirmModalProps) {
  const [timeLeft, setTimeLeft] = useState(timerSeconds);
  useEffect(() => {
    if (!isOpen) {
      setTimeLeft(timerSeconds);
      return;
    }
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, timeLeft, timerSeconds]);
  const handleConfirm = () => {
    if (timeLeft > 0 || disabled) return;
    onConfirm();
  };
  const handleCancel = () => {
    onClose();
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            {danger && (
              <div className="p-2 bg-red-600/10 rounded-lg">
                <HiExclamationTriangle className="w-6 h-6 text-red-600" />
              </div>
            )}
            <h2 className="text-xl font-semibold text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <HiXMark className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {typeof message === "string" ? (
            <p className="text-zinc-300">{message}</p>
          ) : (
            message
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 rounded-b-xl border-t border-zinc-800 bg-zinc-900 p-4 sm:flex-row sm:items-center sm:justify-end sm:p-6">
          <button
            type="button"
            onClick={handleCancel}
            className="min-h-11 rounded-xl px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={timeLeft > 0 || disabled}
            className={`
        min-h-11 px-4 py-2 rounded-xl font-medium transition-all min-w-[120px] text-sm
       ${
         confirmButtonClass ||
         (danger
           ? "bg-red-600 hover:bg-red-700 text-white"
           : "bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700")
       }
       disabled:opacity-50 disabled:cursor-not-allowed
      `}
          >
            {timeLeft > 0 ? `Wait ${timeLeft}s...` : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
