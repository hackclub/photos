"use client";
import Image from "next/image";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  label?: string;
  center?: boolean;
}
const sizeClasses = {
  sm: 20,
  md: 24,
  lg: 32,
  xl: 48,
};
export default function LoadingSpinner({
  size = "md",
  className = "",
  label,
  center = false,
}: LoadingSpinnerProps) {
  const pixelSize = sizeClasses[size];
  const spinner = (
    <div
      className={
        center
          ? "flex flex-col items-center justify-center"
          : "flex items-center gap-2"
      }
    >
      <Image
        src="/heidi-run-optimized.gif"
        alt="Loading..."
        width={pixelSize}
        height={pixelSize}
        className={`object-contain ${className}`}
        style={{ width: pixelSize, height: "auto" }}
        unoptimized
      />
      {label && <span className="text-zinc-400">{label}</span>}
    </div>
  );
  if (center) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        {spinner}
      </div>
    );
  }
  return spinner;
}
