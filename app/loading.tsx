import Image from "next/image";
export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-6 p-8">
        <Image
          src="/heidi-run-optimized.gif"
          alt="Loading..."
          width={200}
          height={112}
          style={{ height: "auto" }}
          unoptimized
        />
      </div>
    </div>
  );
}
