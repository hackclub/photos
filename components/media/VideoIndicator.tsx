import { HiPlay } from "react-icons/hi2";

interface VideoIndicatorProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}
export default function VideoIndicator({
  size = "md",
  className = "",
}: VideoIndicatorProps) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  };
  const iconSizes = {
    sm: "w-5 h-5",
    md: "w-7 h-7",
    lg: "w-9 h-9",
  };
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center pointer-events-none ${className}`}
    >
      <div
        className={`${sizeClasses[size]} rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border-2 border-white/20`}
      >
        <HiPlay className={`${iconSizes[size]} text-white ml-0.5`} />
      </div>
    </div>
  );
}
