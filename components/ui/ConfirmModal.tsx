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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
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
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <HiXMark className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {typeof message === "string" ? (
            <p className="text-zinc-300">{message}</p>
          ) : (
            message
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 bg-zinc-900 rounded-b-xl border-t border-zinc-800">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors font-medium text-sm"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={timeLeft > 0 || disabled}
            className={`
       px-4 py-2 rounded-lg font-medium transition-all min-w-[120px] text-sm
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
