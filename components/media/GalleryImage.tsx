"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { HiPhoto } from "react-icons/hi2";

const AUTO_RETRIES = 5;

interface GalleryImageProps {
  src?: string | null;
  alt: string;
  optimize?: boolean;
  sizes?: string;
  priority?: boolean;
  viewTransitionName?: string;
  className?: string;
}

export default function GalleryImage({
  src,
  alt,
  optimize = false,
  sizes = "(max-width: 767px) 50vw, 240px",
  priority = false,
  viewTransitionName,
  className = "",
}: GalleryImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset load state whenever the source image changes.
  useEffect(() => {
    setIsLoaded(false);
    setRetryCount(0);
  }, [src]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      className={`relative h-full w-full bg-zinc-800 ${className}`}
      style={viewTransitionName ? { viewTransitionName } : undefined}
    >
      <div
        className={`absolute inset-0 flex items-center justify-center bg-zinc-800 transition-opacity duration-300 ${
          isLoaded ? "opacity-0" : "opacity-100"
        }`}
      >
        <HiPhoto className="w-12 h-12 text-zinc-500 animate-pulse" />
      </div>
      {src ? (
        <Image
          key={`${src}#${retryCount}`}
          src={src}
          alt={alt}
          fill
          unoptimized={!optimize}
          sizes={sizes}
          priority={priority}
          fetchPriority={priority ? "high" : undefined}
          className={`object-cover transition-opacity duration-300 ease-out ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            setIsLoaded(false);
            if (retryCount >= AUTO_RETRIES) return;
            timeoutRef.current = setTimeout(
              () => setRetryCount((count) => count + 1),
              350 * (retryCount + 1),
            );
          }}
        />
      ) : null}
    </div>
  );
}
