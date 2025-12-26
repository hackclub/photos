"use client";
import dynamic from "next/dynamic";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

const PhotoMap = dynamic(() => import("@/components/map/PhotoMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[calc(100vh-4rem)] bg-[#0a0a0a]">
      <LoadingSpinner size="xl" label="Loading map..." center />
    </div>
  ),
});
export default function MapPage() {
  return (
    <div className="w-full h-full">
      <PhotoMap />
    </div>
  );
}
