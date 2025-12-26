"use client";
import dynamic from "next/dynamic";

const MiniMap = dynamic(() => import("@/components/map/MiniMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-zinc-800 animate-pulse flex items-center justify-center text-zinc-500 text-sm">
      Loading map...
    </div>
  ),
});
interface Props {
  lat: number;
  lng: number;
  zoom?: number;
  className?: string;
}
export default function SharedPageMapWrapper(props: Props) {
  return <MiniMap {...props} />;
}
