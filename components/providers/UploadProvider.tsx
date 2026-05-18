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
import { trackRybbitEvent } from "@/components/analytics/RybbitUserIdentifier";
import { logger } from "@/lib/client-logger";
import {
  extractMetadata,
  generateThumbnail,
  getAdaptiveUploadLimits,
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
const INITIAL_LIVE_CONCURRENCY = 10;
const MIN_LIVE_CONCURRENCY = 3;
const MAX_LIVE_CONCURRENCY = 40;
const UPLOAD_CONCURRENCY_STAGES = [3, 6, 10, 14, 18, 24, 32, 40] as const;
const STAGE_SPEEDS = [0, 2, 5, 9, 14, 22, 36, 55].map(
  (mbps) => mbps * 1024 * 1024,
);
const MIN_EFFICIENT_BYTES_PER_UPLOAD = 1.25 * 1024 * 1024;
const SLOW_UPLOAD_BYTES_PER_SECOND = 1.5 * 1024 * 1024;
const PROCESSING_FAST_MS = 6000;
const PROCESSING_SLOW_MS = 18000;

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
  const activeBatchIdRef = useRef<string | null>(null);
  const liveUploadLimitRef = useRef(INITIAL_LIVE_CONCURRENCY);
  const liveProcessingLimitRef = useRef(INITIAL_LIVE_CONCURRENCY);
  const lastConcurrencyChangeRef = useRef<number>(0);
  const stableFastSamplesRef = useRef(0);
  const processingDurationRef = useRef(0);
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
    if (validFiles.length > 0) {
      const totalBytes = validFiles.reduce((sum, file) => sum + file.size, 0);
      const imageCount = validFiles.filter((file) =>
        file.type.startsWith("image/"),
      ).length;
      const videoCount = validFiles.filter((file) =>
        file.type.startsWith("video/"),
      ).length;
      const batchId = crypto.randomUUID?.() ?? Math.random().toString(36);
      activeBatchIdRef.current = batchId;
      trackRybbitEvent("upload_added", {
        batch_id: batchId,
        event_id: eventId,
        file_count: validFiles.length,
        rejected_count: rejectedFiles.length,
        image_count: imageCount,
        video_count: videoCount,
        total_bytes: totalBytes,
      });
    } else if (rejectedFiles.length > 0) {
      trackRybbitEvent("upload_rejected", {
        event_id: eventId,
        rejected_count: rejectedFiles.length,
        attempted_count: newFiles.length,
      });
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
    trackRybbitEvent("upload_cancelled", {
      batch_id: activeBatchIdRef.current,
      total_count: filesRef.current.length,
      active_count: filesRef.current.filter(
        (f) => f.status === "uploading" || f.status === "pending",
      ).length,
    });
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
      const startedAt = performance.now();
      const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
      let finalS3Key: string;
      let finalThumbnailS3Key: string | null = null;
      let finalMediaId: string;
      let thumbnailBlob: Blob | null = null;
      let thumbnailError: string | null = null;
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
      const [thumbnailResult, extractedMetadata] = await Promise.allSettled([
        generateThumbnail(fileObj.file),
        extractMetadata(fileObj.file),
      ]);
      if (thumbnailResult.status === "fulfilled") {
        thumbnailBlob = thumbnailResult.value;
      } else {
        thumbnailError =
          thumbnailResult.reason instanceof Error
            ? thumbnailResult.reason.message
            : "Client thumbnail generation failed";
      }
      if (extractedMetadata.status === "fulfilled") {
        metadata = extractedMetadata.value;
      }
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
          thumbnailFailed: !thumbnailBlob,
          thumbnailError,
        },
        true,
      );
      if (result.error) {
        throw new Error(result.error);
      }
      const elapsedMs = performance.now() - startedAt;
      processingDurationRef.current = processingDurationRef.current
        ? processingDurationRef.current * 0.75 + elapsedMs * 0.25
        : elapsedMs;
      if (processingDurationRef.current < PROCESSING_FAST_MS) {
        const nextStage = UPLOAD_CONCURRENCY_STAGES.find(
          (stage) => stage > liveProcessingLimitRef.current,
        );
        liveProcessingLimitRef.current = Math.min(
          MAX_LIVE_CONCURRENCY,
          nextStage ?? liveProcessingLimitRef.current,
        );
      } else if (processingDurationRef.current > PROCESSING_SLOW_MS) {
        liveProcessingLimitRef.current =
          [...UPLOAD_CONCURRENCY_STAGES]
            .reverse()
            .find((stage) => stage < liveProcessingLimitRef.current) ??
          MIN_LIVE_CONCURRENCY;
      }
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status: "success", progress: 100 } : f,
        ),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "Upload cancelled")
        return;
      logger.error("Upload error:", error);
      liveUploadLimitRef.current = Math.max(
        MIN_LIVE_CONCURRENCY,
        [...UPLOAD_CONCURRENCY_STAGES]
          .reverse()
          .find((stage) => stage < liveUploadLimitRef.current) ??
          MIN_LIVE_CONCURRENCY,
      );
      liveProcessingLimitRef.current = Math.max(
        MIN_LIVE_CONCURRENCY,
        [...UPLOAD_CONCURRENCY_STAGES]
          .reverse()
          .find((stage) => stage < liveProcessingLimitRef.current) ??
          MIN_LIVE_CONCURRENCY,
      );
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
      liveUploadLimitRef.current = INITIAL_LIVE_CONCURRENCY;
      liveProcessingLimitRef.current = INITIAL_LIVE_CONCURRENCY;
      stableFastSamplesRef.current = 0;
      processingDurationRef.current = 0;
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
          const activeUploadCount = files.filter(
            (f) => f.status === "uploading",
          ).length;
          const nowMs = Date.now();
          const canAdjust = nowMs - lastConcurrencyChangeRef.current > 2000;
          const effectiveActiveCount = Math.max(1, activeUploadCount);
          const bytesPerActiveUpload = newSmoothedSpeed / effectiveActiveCount;
          if (canAdjust && activeUploadCount >= liveUploadLimitRef.current) {
            const targetStage = UPLOAD_CONCURRENCY_STAGES.findLastIndex(
              (stage, index) =>
                newSmoothedSpeed >= STAGE_SPEEDS[index] &&
                (stage <= 24 ||
                  bytesPerActiveUpload >= MIN_EFFICIENT_BYTES_PER_UPLOAD),
            );
            const targetLimit =
              UPLOAD_CONCURRENCY_STAGES[Math.max(0, targetStage)] ??
              MIN_LIVE_CONCURRENCY;
            if (targetLimit > liveUploadLimitRef.current) {
              stableFastSamplesRef.current += 1;
              if (stableFastSamplesRef.current >= 2) {
                liveUploadLimitRef.current = Math.min(
                  MAX_LIVE_CONCURRENCY,
                  Math.max(
                    liveUploadLimitRef.current + 1,
                    UPLOAD_CONCURRENCY_STAGES.find(
                      (stage) => stage > liveUploadLimitRef.current,
                    ) ?? MAX_LIVE_CONCURRENCY,
                  ),
                );
                liveProcessingLimitRef.current = Math.max(
                  liveProcessingLimitRef.current,
                  liveUploadLimitRef.current,
                );
                stableFastSamplesRef.current = 0;
                lastConcurrencyChangeRef.current = nowMs;
              }
            } else if (
              newSmoothedSpeed < SLOW_UPLOAD_BYTES_PER_SECOND ||
              bytesPerActiveUpload < MIN_EFFICIENT_BYTES_PER_UPLOAD / 2
            ) {
              const lowerStage = [...UPLOAD_CONCURRENCY_STAGES]
                .reverse()
                .find((stage) => stage < liveUploadLimitRef.current);
              liveUploadLimitRef.current = lowerStage ?? MIN_LIVE_CONCURRENCY;
              liveProcessingLimitRef.current = Math.min(
                liveProcessingLimitRef.current,
                Math.max(liveUploadLimitRef.current, MIN_LIVE_CONCURRENCY),
              );
              stableFastSamplesRef.current = 0;
              lastConcurrencyChangeRef.current = nowMs;
            } else {
              stableFastSamplesRef.current = 0;
            }
          }
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
        const successCount = files.filter((f) => f.status === "success").length;
        const errorCount = files.filter((f) => f.status === "error").length;
        trackRybbitEvent("upload_finished", {
          batch_id: activeBatchIdRef.current,
          total_count: files.length,
          success_count: successCount,
          error_count: errorCount,
        });
        activeBatchIdRef.current = null;
        setIsUploading(false);
        router.refresh();
      }
      return;
    }
    const adaptiveLimits = getAdaptiveUploadLimits();
    const maxUploads = Math.min(
      MAX_CONCURRENT_UPLOADS,
      adaptiveLimits.maxUploads,
      liveUploadLimitRef.current,
    );
    const maxProcessing = Math.min(
      MAX_CONCURRENT_PROCESSING,
      adaptiveLimits.maxProcessing,
      liveProcessingLimitRef.current,
    );
    if (
      uploadingFiles.length < maxUploads &&
      processingFiles.length < maxProcessing
    ) {
      const uploadSlots = maxUploads - uploadingFiles.length;
      const processingSlots = maxProcessing - processingFiles.length;
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
