"use client";
import { useState } from "react";
import { HiArrowUpTray, HiXMark } from "react-icons/hi2";
import PhotoUploader from "./PhotoUploader";

interface UploadButtonProps {
  eventId: string;
  onUploadComplete?: (key: string) => void;
}
export default function UploadButton({
  eventId,
  onUploadComplete,
}: UploadButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const handleUploadClick = () => {
    setIsOpen(true);
  };
  return (
    <>
      <button
        onClick={handleUploadClick}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 sm:text-base"
      >
        <HiArrowUpTray className="w-5 h-5" />
        <span>Upload Photos</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          <div className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 p-4 sm:p-6">
              <div>
                <h2 className="text-xl font-bold text-white sm:text-2xl">
                  Upload Photos & Videos
                </h2>
                <p className="text-zinc-400 mt-1">
                  Add your photos and videos to this event
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 transition-colors hover:bg-zinc-700"
              >
                <HiXMark className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="p-4 sm:p-6">
              <PhotoUploader
                eventId={eventId}
                onComplete={(key) => {
                  setIsOpen(false);
                  if (onUploadComplete && typeof key === "string") {
                    onUploadComplete(key);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
