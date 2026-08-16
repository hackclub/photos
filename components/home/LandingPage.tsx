"use client";
import { Anton } from "next/font/google";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  HiArrowRightOnRectangle,
  HiCalendar,
  HiFolder,
  HiMap,
} from "react-icons/hi2";

const heroFont = Anton({
  subsets: ["latin"],
  weight: "400",
});

const ROWS = [
  { duration: "70s", dir: "left" as const },
  { duration: "150s", dir: "right" as const },
  { duration: "95s", dir: "left" as const },
  { duration: "190s", dir: "right" as const },
  { duration: "55s", dir: "left" as const },
];

function StripImage({ src, eager }: { src: string; eager: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="h-full aspect-[4/3] shrink-0 overflow-hidden bg-zinc-900">
      <img
        src={src}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-opacity duration-700 ease-out ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

export default function LandingPage({ images = [] }: { images?: string[] }) {
  const hasImages = images.length > 0;
  const [copySize, setCopySize] = useState(12);

  useEffect(() => {
    const compute = () => {
      const cells =
        Math.ceil((window.innerWidth / window.innerHeight) * 3.75) + 2;
      setCopySize(Math.max(12, cells));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  return (
    <main className="relative min-h-dvh overflow-hidden bg-black text-white">
      {hasImages && (
        <div className="absolute inset-0 flex flex-col" aria-hidden="true">
          {ROWS.map((row, r) => {
            const base = Array.from(
              { length: copySize },
              (_, i) => images[(i + r * 4) % images.length],
            );
            const tripled = [...base, ...base, ...base];
            const anim =
              row.dir === "left"
                ? "animate-scroll-left"
                : "animate-scroll-right";
            return (
              <div key={r} className="flex-1 overflow-hidden">
                <div
                  className={`flex h-full w-max ${anim}`}
                  style={{ animationDuration: row.duration }}
                >
                  {tripled.map((src, i) => (
                    <StripImage
                      key={`${r}-${i}`}
                      src={src}
                      eager={i < 12}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <h1
          className={`${heroFont.className} text-6xl uppercase leading-[0.9] tracking-tight md:text-8xl`}
        >
          Hack Club
          <br />
          <span className="text-red-600">Photos</span>
        </h1>
        <Link
          prefetch={false}
          href="/auth/signin"
          className="mt-10 inline-flex items-center gap-3 rounded-lg bg-red-600 px-10 py-4 text-xl font-bold text-white transition-colors hover:bg-red-700"
        >
          <HiArrowRightOnRectangle className="h-6 w-6" />
          Log in
        </Link>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            prefetch={false}
            href="/events"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            <HiCalendar className="h-4 w-4" />
            Events
          </Link>
          <Link
            prefetch={false}
            href="/series"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            <HiFolder className="h-4 w-4" />
            Series
          </Link>
          <Link
            prefetch={false}
            href="/map"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            <HiMap className="h-4 w-4" />
            Map
          </Link>
        </div>
      </div>
    </main>
  );
}
