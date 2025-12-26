"use client";
import Link from "next/link";
import { useEffect } from "react";
import { HiArrowPath, HiExclamationTriangle, HiHome } from "react-icons/hi2";
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-950">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-8 flex justify-center">
          <div className="w-24 h-24 rounded-full bg-red-600/10 flex items-center justify-center">
            <HiExclamationTriangle className="w-12 h-12 text-red-600" />
          </div>
        </div>

        <h1 className="text-4xl font-bold text-white mb-4">
          Something went wrong
        </h1>
        <h2 className="text-xl font-medium text-zinc-300 mb-8">
          Heidi chewed on the wrong cable
        </h2>

        <p className="text-lg text-zinc-400 mb-4 max-w-md mx-auto">
          We encountered an unexpected error. Orpheus is looking into it, but
          he's mostly just staring at the screen looking concerned.
        </p>

        {error.digest && (
          <p className="text-sm text-zinc-600 mb-8 font-mono">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
          >
            <HiArrowPath className="w-5 h-5" />
            <span>Try again</span>
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg transition-colors"
          >
            <HiHome className="w-5 h-5" />
            <span>Go home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
