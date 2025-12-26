"use client";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { HiOutlinePhoto, HiXMark } from "react-icons/hi2";
import {
  deleteEventBanner,
  deleteSeriesBanner,
  uploadEventBanner,
  uploadSeriesBanner,
} from "@/app/actions/media";
import ConfirmModal from "@/components/ui/ConfirmModal";

interface BannerUploadProps {
  type: "event" | "series";
  id: string;
  currentBannerS3Key?: string | null;
  onUploadSuccess?: (s3Key: string) => void;
  onDeleteSuccess?: () => void;
}
export default function BannerUpload({
  type,
  id,
  currentBannerS3Key,
  onUploadSuccess,
  onDeleteSuccess,
}: BannerUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingBanner, _setLoadingBanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  useEffect(() => {
    if (!currentBannerS3Key || previewUrl) return;
    const assetType = type === "series" ? "series-banner" : "event-banner";
    setPreviewUrl(`/assets/${assetType}/${id}?t=${Date.now()}`);
  }, [currentBannerS3Key, previewUrl, type, id]);
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];
      setError(null);
      setUploading(true);
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
      try {
        const formData = new FormData();
        formData.append("banner", file);
        let result: {
          success?: boolean;
          error?: string;
          bannerS3Key?: string;
        };
        if (type === "series") {
          result = await uploadSeriesBanner(id, formData);
        } else {
          result = await uploadEventBanner(id, formData);
        }
        if (!result.success) {
          throw new Error(result.error || "Failed to upload banner");
        }
        if (result.bannerS3Key) {
          onUploadSuccess?.(result.bannerS3Key);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to upload banner",
        );
        setPreviewUrl(null);
      } finally {
        setUploading(false);
      }
    },
    [type, id, onUploadSuccess],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/gif": [".gif"],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });
  const handleDeleteConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      let result: {
        success?: boolean;
        error?: string;
      };
      if (type === "series") {
        result = await deleteSeriesBanner(id);
      } else {
        result = await deleteEventBanner(id);
      }
      if (!result.success) {
        throw new Error(result.error || "Failed to delete banner");
      }
      setPreviewUrl(null);
      setShowDeleteModal(false);
      onDeleteSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete banner");
    } finally {
      setDeleting(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="block text-sm font-medium text-zinc-300">
        Banner Image
      </div>

      {loadingBanner ? (
        <div className="w-full h-48 bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : previewUrl ? (
        <div className="relative w-full h-48">
          <Image
            src={previewUrl}
            alt="Banner preview"
            fill
            className="object-cover rounded-lg border border-zinc-700"
            sizes="(max-width: 768px) 100vw, 800px"
            unoptimized
          />
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            disabled={deleting || uploading}
            className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg disabled:opacity-50"
          >
            {deleting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <HiXMark className="w-5 h-5" />
            )}
          </button>
          <div className="mt-2">
            <div
              {...getRootProps()}
              className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-300"
            >
              <input {...getInputProps()} />
              Click or drag to replace banner
            </div>
          </div>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? "border-blue-500 bg-blue-500/10"
              : "border-zinc-700 hover:border-zinc-700"
          } ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <input {...getInputProps()} disabled={uploading} />
          {uploading ? (
            <div className="flex flex-col items-center space-y-2">
              <div className="w-12 h-12 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-400">Uploading banner...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              <HiOutlinePhoto className="w-12 h-12 text-zinc-400" />
              <div>
                <p className="text-zinc-300">
                  {isDragActive
                    ? "Drop banner image here"
                    : "Drag & drop banner image here"}
                </p>
                <p className="text-sm text-zinc-500 mt-1">or click to select</p>
              </div>
              <p className="text-xs text-zinc-600">
                JPG, PNG, WebP, or GIF (max 10MB)
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-600/10 border border-red-600 rounded-lg p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Banner will be automatically resized to 2000px width while maintaining
        aspect ratio.
      </p>

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Banner"
        message="Are you sure you want to remove this banner? This action cannot be undone."
        confirmText="Delete Banner"
        cancelText="Cancel"
        danger={true}
        timerSeconds={3}
      />
    </div>
  );
}
