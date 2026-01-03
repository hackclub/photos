"use client";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

interface HeroProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  images?: string[];
  className?: string;
  size?: "sm" | "lg";
}
export default function Hero({
  title,
  subtitle,
  actions,
  images = [],
  className,
  size = "lg",
}: HeroProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  let displayImages: string[] = [];
  if (images.length > 0) {
    displayImages = [...images];
    while (displayImages.length < 12) {
      displayImages = [...displayImages, ...images];
    }
    displayImages = [...displayImages, ...displayImages, ...displayImages];
  }
  const hasImages = displayImages.length > 0;
  return (
    <div
      className={twMerge(
        "relative overflow-hidden bg-zinc-900 border-b border-zinc-800",
        className,
      )}
    >
      <div className="absolute inset-0 z-0">
        {hasImages && mounted ? (
          <div className="absolute inset-0 overflow-hidden opacity-80">
            <div
              className="flex h-full animate-scroll-left w-max"
              style={{
                animationDuration: `${displayImages.length * 2}s`,
              }}
            >
              {displayImages.map((src, index) => (
                <div
                  key={`${src}-${index}`}
                  className="relative h-full aspect-[16/9] sm:aspect-[4/3] flex-shrink-0 border-r border-zinc-900/50"
                >
                  <img
                    src={src}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover blur-[4px]"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/20 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-900/60 via-transparent to-zinc-900/60" />
      </div>

      <div
        className={twMerge(
          "relative z-10 px-4 sm:px-8 flex flex-col justify-center",
          size === "lg" ? "py-16 sm:py-24 md:py-32" : "py-12 sm:py-16 md:py-20",
          className,
        )}
      >
        <div className="max-w-5xl mx-auto text-center">
          <h1
            className={twMerge(
              "font-bold text-white tracking-tight drop-shadow-lg",
              size === "lg"
                ? "text-3xl sm:text-4xl md:text-6xl mb-6"
                : "text-2xl sm:text-3xl md:text-4xl mb-4",
            )}
          >
            {title}
          </h1>

          {subtitle && (
            <div
              className={twMerge(
                "text-zinc-200 max-w-3xl mx-auto drop-shadow-md leading-relaxed",
                size === "lg"
                  ? "text-lg sm:text-xl md:text-2xl mb-10"
                  : "text-base sm:text-lg md:text-xl mb-6",
              )}
            >
              {subtitle}
            </div>
          )}

          {actions && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
