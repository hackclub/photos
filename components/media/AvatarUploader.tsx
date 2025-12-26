"use client";
import { useCallback, useRef, useState } from "react";
import { HiArrowUpTray, HiExclamationCircle } from "react-icons/hi2";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface AvatarUploaderProps {
  onUploadComplete: (key: string, url: string) => void;
  onUpload?: (file: File) => Promise<{
    success: boolean;
    avatarS3Key?: string;
    url?: string;
    error?: string;
  }>;
}
export default function AvatarUploader({
  onUploadComplete,
  onUpload,
}: AvatarUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
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
  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("Please upload an image file");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("File size must be less than 5MB");
        return;
      }
      setIsUploading(true);
      setError("");
      try {
        if (onUpload) {
          const result = await onUpload(file);
          if (result.success && result.avatarS3Key && result.url) {
            onUploadComplete(result.avatarS3Key, result.url);
          } else {
            setError(result.error || "Upload failed");
          }
          return;
        }
        const formData = new FormData();
        formData.append("avatar", file);
        const { uploadUserAvatar } = await import("@/app/actions/users");
        const result = await uploadUserAvatar(formData);
        if (result.success && result.avatarS3Key && result.url) {
          onUploadComplete(result.avatarS3Key, result.url);
        } else {
          setError(result.error || "Upload failed");
        }
      } catch (err) {
        console.error("Upload error:", err);
        setError("Something went wrong. Please try again.");
      } finally {
        setIsUploading(false);
      }
    },
    [onUploadComplete, onUpload],
  );
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        uploadFile(files[0]);
      }
    },
    [uploadFile],
  );
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        uploadFile(files[0]);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [uploadFile],
  );
  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !isUploading && fileInputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl transition-all cursor-pointer group ${
        isDragging
          ? "border-red-600 bg-red-600/10"
          : "border-zinc-800 hover:border-red-600/50 hover:bg-zinc-900/50"
      } ${isUploading ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />

      <div className="p-6 text-center">
        {isUploading ? (
          <div className="flex flex-col items-center justify-center py-2">
            <LoadingSpinner size="md" />
            <p className="text-sm text-zinc-400 mt-3">Uploading...</p>
          </div>
        ) : (
          <>
            <div
              className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center transition-all ${
                isDragging
                  ? "bg-red-600/20 scale-110"
                  : "bg-zinc-800 group-hover:bg-zinc-700"
              }`}
            >
              <HiArrowUpTray
                className={`w-6 h-6 transition-colors ${
                  isDragging
                    ? "text-red-400"
                    : "text-zinc-400 group-hover:text-zinc-300"
                }`}
              />
            </div>
            <p className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              SVG, PNG, JPG or GIF (max. 5MB)
            </p>
          </>
        )}

        {error && (
          <div className="absolute inset-x-0 bottom-0 p-2 bg-red-600/10 border-t border-red-600/20 rounded-b-lg">
            <p className="text-xs text-red-400 flex items-center justify-center gap-1">
              <HiExclamationCircle className="w-3 h-3" />
              {error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
