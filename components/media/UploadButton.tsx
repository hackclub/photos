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
        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
      >
        <HiArrowUpTray className="w-5 h-5" />
        <span>Upload Photos</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Upload Photos & Videos
                </h2>
                <p className="text-zinc-400 mt-1">
                  Add your photos and videos to this event
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-10 h-10 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors"
              >
                <HiXMark className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="p-6">
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
