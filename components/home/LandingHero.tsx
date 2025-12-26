"use client";
import { Anton } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

const heroFont = Anton({
  subsets: ["latin"],
  weight: "400",
});
interface LandingHeroProps {
  images: string[];
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}
export default function LandingHero({
  images = [],
  title,
  subtitle,
  actions,
}: LandingHeroProps) {
  const [_mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const row1 = [...images].sort(() => Math.random() - 0.5);
  const row2 = [...images].sort(() => Math.random() - 0.5);
  const row3 = [...images].sort(() => Math.random() - 0.5);
  const prepareRow = (imgs: string[]) => {
    let displayImages = [...imgs];
    while (displayImages.length < 10) {
      displayImages = [...displayImages, ...imgs];
    }
    return [...displayImages, ...displayImages, ...displayImages];
  };
  const displayRow1 = prepareRow(row1);
  const displayRow2 = prepareRow(row2);
  const displayRow3 = prepareRow(row3);
  return (
    <div className="relative min-h-[60vh] flex flex-col justify-center overflow-hidden bg-black">
      <div className="absolute inset-0 z-0 opacity-60 select-none pointer-events-none">
        <div
          className="absolute inset-0 flex flex-col gap-8 -rotate-6 scale-125 -translate-y-20"
          style={{ transformOrigin: "center center" }}
        >
          <div className="w-full overflow-hidden">
            <div
              className="flex gap-4 animate-scroll-left w-max"
              style={{ animationDuration: "120s" }}
            >
              {displayRow1.map((src, i) => (
                <div
                  key={`r1-${i}`}
                  className="relative w-64 h-48 rounded-xl overflow-hidden shadow-2xl flex-shrink-0"
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="256px"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="w-full overflow-hidden">
            <div
              className="flex gap-4 animate-scroll-right w-max"
              style={{ animationDuration: "140s" }}
            >
              {displayRow2.map((src, i) => (
                <div
                  key={`r2-${i}`}
                  className="relative w-80 h-60 rounded-xl overflow-hidden shadow-2xl flex-shrink-0"
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="320px"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="w-full overflow-hidden">
            <div
              className="flex gap-4 animate-scroll-right w-max"
              style={{ animationDuration: "130s" }}
            >
              {displayRow3.map((src, i) => (
                <div
                  key={`r3-${i}`}
                  className="relative w-64 h-48 rounded-xl overflow-hidden shadow-2xl flex-shrink-0"
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="256px"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-black z-10" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60 z-10" />

      <div className="relative z-20 container mx-auto px-4 text-center">
        {title ? (
          <div
            className={twMerge(
              "text-6xl md:text-8xl lg:text-9xl font-black text-white tracking-tighter mb-6 drop-shadow-2xl uppercase",
              heroFont.className,
            )}
          >
            {title}
          </div>
        ) : (
          <h1
            className={twMerge(
              "text-6xl md:text-8xl lg:text-9xl font-black text-white tracking-tighter mb-6 drop-shadow-2xl uppercase",
              heroFont.className,
            )}
          >
            Hack Club
            <br />
            <span className="text-red-600">Photos</span>
          </h1>
        )}

        {subtitle ? (
          <div className="text-lg md:text-xl text-zinc-200 max-w-2xl mx-auto mb-8 leading-relaxed drop-shadow-lg font-medium">
            {subtitle}
          </div>
        ) : (
          <p className="text-lg md:text-xl text-zinc-200 max-w-2xl mx-auto mb-8 leading-relaxed drop-shadow-lg font-medium">
            Every hackathon, every workshop, every midnight pizza run.
            <br />
            All the photos from the Hack Club universe, in one place.
          </p>
        )}

        {actions ? (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {actions}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/signin"
              className="group relative px-8 py-4 bg-red-600 text-white font-bold text-lg rounded-xl transition-all hover:scale-105 hover:bg-red-700 hover:shadow-[0_0_40px_-10px_rgba(220,38,38,0.5)]"
            >
              <span className="relative z-10">Join the Party</span>
            </Link>

            <Link
              href="/events"
              className="px-8 py-4 bg-zinc-900 text-white font-bold text-lg rounded-xl border border-zinc-800 transition-all hover:bg-zinc-800 hover:scale-105"
            >
              Explore Events
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
