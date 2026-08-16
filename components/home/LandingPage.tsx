import { Anton } from "next/font/google";
import Link from "next/link";

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

function stripImages(images: string[], offset: number, count: number) {
  if (images.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(images[(i + offset) % images.length]);
  }
  return out;
}

export default function LandingPage({ images = [] }: { images?: string[] }) {
  const hasImages = images.length > 0;

  return (
    <main className="relative min-h-dvh overflow-hidden bg-black text-white">
      {hasImages && (
        <div className="absolute inset-0 flex flex-col" aria-hidden="true">
          {ROWS.map((row, r) => {
            const base = stripImages(images, r * 4, 12);
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
                    <div key={`${r}-${i}`} className="h-full shrink-0 px-1.5">
                      <img
                        src={src}
                        alt=""
                        loading={i < 4 ? "eager" : "lazy"}
                        decoding="async"
                        className="h-full w-auto max-w-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="absolute inset-0 bg-black/40" />

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
          className="mt-10 inline-flex items-center justify-center rounded-lg bg-red-600 px-14 py-5 text-xl font-bold text-white transition-colors hover:bg-red-700"
        >
          Log in
        </Link>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            prefetch={false}
            href="/events"
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Events
          </Link>
          <Link
            prefetch={false}
            href="/series"
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Series
          </Link>
          <Link
            prefetch={false}
            href="/map"
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Map
          </Link>
        </div>
      </div>
    </main>
  );
}
