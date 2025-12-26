"use client";
import { useCallback, useRef, useState } from "react";
import { HiArrowUpTray, HiPhoto } from "react-icons/hi2";
import { useUpload } from "@/components/providers/UploadProvider";

interface PhotoUploaderProps {
  eventId: string;
  onComplete?: (key?: string) => void;
}
export default function PhotoUploader({
  eventId,
  onComplete,
}: PhotoUploaderProps) {
  const { addFiles } = useUpload();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFiles(Array.from(e.dataTransfer.files), eventId);
      }
    },
    [addFiles, eventId],
  );
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(Array.from(e.target.files), eventId);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [addFiles, eventId],
  );
  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-xl transition-all ${
        isDragging
          ? "border-red-600 bg-red-600/10"
          : "border-zinc-800 hover:border-zinc-700 bg-zinc-900"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="p-6 sm:p-12 text-center">
        <div
          className={`w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full flex items-center justify-center transition-all ${isDragging ? "bg-red-600/20 scale-110" : "bg-zinc-800"}`}
        >
          <HiArrowUpTray
            className={`w-6 h-6 sm:w-8 sm:h-8 transition-colors ${isDragging ? "text-red-400" : "text-zinc-400"}`}
          />
        </div>

        <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">
          {isDragging ? "Drop files here" : "Upload photos and videos"}
        </h3>

        <p className="text-sm sm:text-base text-zinc-400 mb-4 sm:mb-6">
          Drag and drop your files here, or click to browse
        </p>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
        >
          <HiPhoto className="w-5 h-5" />
          <span>Select Files</span>
        </button>

        <p className="text-xs text-zinc-500 mt-3 sm:mt-4">
          Supports: JPG, PNG, GIF, MP4, MOV, and more
        </p>
      </div>
    </div>
  );
}
