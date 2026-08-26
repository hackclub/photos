"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { markMediaThumbnailReady } from "@/app/actions/media";
import { logger } from "@/lib/client-logger";
import {
  generateVideoThumbnailFromUrl,
  uploadToPresignedUrl,
} from "@/lib/media/browser-utils";

const attempted = new Set<string>();

interface OnDemandVideoThumbProps {
  mediaId: string;
  className?: string;
}

export default function OnDemandVideoThumb({
  mediaId,
  className,
}: OnDemandVideoThumbProps) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const startRef = useRef(false);

  useEffect(() => {
    if (startRef.current) return;
    startRef.current = true;
    if (attempted.has(mediaId)) return;
    attempted.add(mediaId);
    const controller = new AbortController();
    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch(`/media/${mediaId}/thumbnail`, {
          method: "POST",
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          uploadUrl?: string | null;
        };
        if (!data.uploadUrl) return;
        const blob = await generateVideoThumbnailFromUrl(
          `/media/${mediaId}`,
          controller.signal,
        );
        if (!blob) return;
        await uploadToPresignedUrl(
          data.uploadUrl,
          blob,
          "image/jpeg",
          () => {},
          controller.signal,
        );
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setPosterUrl(url);
        await markMediaThumbnailReady(mediaId);
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.warn("On-demand video thumbnail generation failed:", error);
      }
    };
    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mediaId]);

  if (!posterUrl) return <div className={className} />;
  return (
    <Image
      src={posterUrl}
      alt=""
      fill
      unoptimized
      sizes="(max-width: 767px) 50vw, 240px"
      draggable={false}
      className="object-cover"
    />
  );
}
