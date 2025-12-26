"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { finalizeUpload, getPresignedUrl } from "@/app/actions/upload";
import {
  extractMetadata,
  generateThumbnail,
  MAX_CONCURRENT_PROCESSING,
  MAX_CONCURRENT_UPLOADS,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  type UploadFile,
  uploadMultipartToS3,
  uploadToPresignedUrl,
} from "@/lib/media/browser-utils";
import type { ExifData } from "@/lib/media/exif";

interface UploadContextType {
  files: UploadFile[];
  addFiles: (files: File[], eventId: string) => void;
  removeFile: (id: string) => void;
  cancelUpload: () => void;
  isUploading: boolean;
  isMinimized: boolean;
  setIsMinimized: (minimized: boolean) => void;
  clearCompleted: () => void;
  error: string | null;
  setError: (error: string | null) => void;
  uploadSpeed: number;
  timeRemaining: number | null;
}
const UploadContext = createContext<UploadContextType | null>(null);
export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error("useUpload must be used within an UploadProvider");
  }
  return context;
}
export function UploadProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const lastBytesLoadedRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(Date.now());
  const smoothedSpeedRef = useRef<number>(0);
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => {
    return () => {
      filesRef.current.forEach((f) => {
        URL.revokeObjectURL(f.preview);
      });
    };
  }, []);
  const addFiles = useCallback((newFiles: File[], eventId: string) => {
    const validFiles: File[] = [];
    const rejectedFiles: string[] = [];
    newFiles.forEach((file) => {
      if (file.type.startsWith("image/") && file.size > MAX_IMAGE_SIZE) {
        rejectedFiles.push(`${file.name} (image too large > 50MB)`);
        return;
      }
      if (file.type.startsWith("video/") && file.size > MAX_VIDEO_SIZE) {
        rejectedFiles.push(`${file.name} (video too large > 5GB)`);
        return;
      }
      validFiles.push(file);
    });
    if (rejectedFiles.length > 0) {
      const count = rejectedFiles.length;
      const message =
        count === 1
          ? `File rejected: ${rejectedFiles[0]}`
          : `${count} files rejected: ${rejectedFiles.slice(0, 3).join(", ")}${count > 3 ? ` and ${count - 3} more` : ""}`;
      setError(message);
    }
    const uploadFiles: UploadFile[] = validFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file),
      status: "pending",
      progress: 0,
      eventId,
    }));
    setFiles((prev) => [...prev, ...uploadFiles]);
    setIsUploading(true);
    setIsMinimized(false);
  }, []);
  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file) {
        URL.revokeObjectURL(file.preview);
        file.abortController?.abort();
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);
  const cancelUpload = useCallback(() => {
    setIsUploading(false);
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.status === "uploading" || f.status === "pending") {
          f.abortController?.abort();
        }
      });
      return prev.map((f) =>
        f.status === "uploading" || f.status === "pending"
          ? { ...f, status: "error", error: "Cancelled" }
          : f,
      );
    });
  }, []);
  const clearCompleted = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.status === "success") {
          URL.revokeObjectURL(f.preview);
        }
      });
      return prev.filter((f) => f.status !== "success");
    });
  }, []);
  const startUpload = useCallback(async (fileObj: UploadFile) => {
    const fileId = fileObj.id;
    const abortController = new AbortController();
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? { ...f, status: "uploading", progress: 0, abortController }
          : f,
      ),
    );
    try {
      const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
      let finalS3Key: string;
      let finalThumbnailS3Key: string | null = null;
      let finalMediaId: string;
      let thumbnailBlob: Blob | null = null;
      let metadata: {
        exifData: ExifData | null;
        width: number | null;
        height: number | null;
        takenAt: Date | null;
        duration?: number;
      } = {
        exifData: null,
        width: null,
        height: null,
        takenAt: null,
      };
      [thumbnailBlob, metadata] = await Promise.all([
        generateThumbnail(fileObj.file),
        extractMetadata(fileObj.file),
      ]);
      if (fileObj.file.size > MULTIPART_THRESHOLD) {
        const result = await uploadMultipartToS3(
          fileObj.file,
          fileObj.eventId,
          (percent) => {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileId
                  ? { ...f, progress: Math.round(percent * 0.9) }
                  : f,
              ),
            );
          },
          abortController.signal,
        );
        finalS3Key = result.s3Key;
        finalThumbnailS3Key = result.thumbnailS3Key;
        finalMediaId = result.mediaId;
        if (thumbnailBlob && result.thumbnailUploadUrl) {
          await uploadToPresignedUrl(
            result.thumbnailUploadUrl,
            thumbnailBlob,
            "image/jpeg",
            () => {},
            abortController.signal,
          );
        }
      } else {
        const presigned = await getPresignedUrl(
          fileObj.eventId,
          fileObj.file.name,
          fileObj.file.type,
          fileObj.file.size,
        );
        if (
          presigned.error ||
          !presigned.success ||
          !presigned.s3Key ||
          !presigned.mediaId
        ) {
          throw new Error(presigned.error || "Failed to get upload URL");
        }
        finalS3Key = presigned.s3Key;
        finalThumbnailS3Key = presigned.thumbnailS3Key;
        finalMediaId = presigned.mediaId;
        const uploadPromises = [
          uploadToPresignedUrl(
            presigned.uploadUrl,
            fileObj.file,
            fileObj.file.type,
            (percent) => {
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === fileId
                    ? { ...f, progress: Math.round(percent * 0.9) }
                    : f,
                ),
              );
            },
            abortController.signal,
          ),
        ];
        if (thumbnailBlob && presigned.thumbnailUploadUrl) {
          uploadPromises.push(
            uploadToPresignedUrl(
              presigned.thumbnailUploadUrl,
              thumbnailBlob,
              "image/jpeg",
              () => {},
              abortController.signal,
            ),
          );
        }
        await Promise.all(uploadPromises);
      }
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status: "processing", progress: 95 } : f,
        ),
      );
      const result = await finalizeUpload(
        finalMediaId,
        fileObj.eventId,
        {
          filename: fileObj.file.name,
          fileSize: fileObj.file.size,
          mimeType: fileObj.file.type,
          width: metadata.width || null,
          height: metadata.height || null,
          takenAt: metadata.takenAt ? metadata.takenAt.toISOString() : null,
          exifData: metadata.exifData,
          s3Key: finalS3Key,
          thumbnailS3Key: thumbnailBlob ? finalThumbnailS3Key : null,
        },
        true,
      );
      if (result.error) {
        throw new Error(result.error);
      }
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status: "success", progress: 100 } : f,
        ),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "Upload cancelled")
        return;
      console.error("Upload error:", error);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: "error",
                error: error instanceof Error ? error.message : "Upload failed",
              }
            : f,
        ),
      );
    }
  }, []);
  useEffect(() => {
    if (!isUploading) {
      setUploadSpeed(0);
      setTimeRemaining(null);
      lastBytesLoadedRef.current = 0;
      smoothedSpeedRef.current = 0;
      return;
    }
    const interval = setInterval(() => {
      const now = Date.now();
      const timeDiff = (now - lastTimeRef.current) / 1000;
      if (timeDiff >= 0.5) {
        const totalBytesUploaded = files.reduce((acc, f) => {
          if (f.status === "success" || f.status === "processing") {
            return acc + f.file.size;
          }
          if (f.status === "uploading") {
            return acc + (f.file.size * f.progress) / 100;
          }
          return acc;
        }, 0);
        if (totalBytesUploaded > lastBytesLoadedRef.current) {
          const bytesDiff = totalBytesUploaded - lastBytesLoadedRef.current;
          const currentSpeed = bytesDiff / timeDiff;
          const alpha = 0.1;
          const newSmoothedSpeed =
            smoothedSpeedRef.current === 0
              ? currentSpeed
              : currentSpeed * alpha + smoothedSpeedRef.current * (1 - alpha);
          smoothedSpeedRef.current = newSmoothedSpeed;
          setUploadSpeed(newSmoothedSpeed);
        } else if (
          totalBytesUploaded === lastBytesLoadedRef.current &&
          timeDiff > 2
        ) {
          smoothedSpeedRef.current = smoothedSpeedRef.current * 0.98;
          setUploadSpeed(smoothedSpeedRef.current);
        }
        const totalBytes = files.reduce((acc, f) => acc + f.file.size, 0);
        const remainingBytes = totalBytes - totalBytesUploaded;
        if (smoothedSpeedRef.current > 1024) {
          const estimate = Math.ceil(
            (remainingBytes / smoothedSpeedRef.current) * 1.05,
          );
          setTimeRemaining(estimate);
        } else if (remainingBytes === 0) {
          setTimeRemaining(0);
        }
        lastBytesLoadedRef.current = totalBytesUploaded;
        lastTimeRef.current = now;
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isUploading, files]);
  useEffect(() => {
    if (!isUploading) return;
    const pendingFiles = files.filter((f) => f.status === "pending");
    const uploadingFiles = files.filter((f) => f.status === "uploading");
    const processingFiles = files.filter((f) => f.status === "processing");
    const activeFiles = [...uploadingFiles, ...processingFiles];
    if (pendingFiles.length === 0) {
      if (activeFiles.length === 0) {
        setIsUploading(false);
        router.refresh();
      }
      return;
    }
    if (
      uploadingFiles.length < MAX_CONCURRENT_UPLOADS &&
      processingFiles.length < MAX_CONCURRENT_PROCESSING
    ) {
      const uploadSlots = MAX_CONCURRENT_UPLOADS - uploadingFiles.length;
      const processingSlots =
        MAX_CONCURRENT_PROCESSING - processingFiles.length;
      const slotsAvailable = Math.min(uploadSlots, processingSlots);
      if (slotsAvailable > 0) {
        const filesToStart = pendingFiles.slice(0, slotsAvailable);
        filesToStart.forEach((file) => {
          startUpload(file);
        });
      }
    }
  }, [files, isUploading, startUpload, router]);
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const activeUploads = files.filter(
        (f) => f.status === "uploading" || f.status === "processing",
      );
      if (activeUploads.length > 0) {
        e.preventDefault();
        e.returnValue = "Upload in progress. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [files]);
  const contextValue = useMemo(
    () => ({
      files,
      addFiles,
      removeFile,
      cancelUpload,
      isUploading,
      isMinimized,
      setIsMinimized,
      clearCompleted,
      error,
      setError,
      uploadSpeed,
      timeRemaining,
    }),
    [
      files,
      addFiles,
      removeFile,
      cancelUpload,
      isUploading,
      isMinimized,
      clearCompleted,
      error,
      uploadSpeed,
      timeRemaining,
    ],
  );
  return (
    <UploadContext.Provider value={contextValue}>
      {children}
    </UploadContext.Provider>
  );
}
