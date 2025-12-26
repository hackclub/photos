import Image from "next/image";
import Link from "next/link";
import { HiHome } from "react-icons/hi2";
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-8 flex justify-center">
          <Image
            src="/lost.png"
            alt="Lost in the sauce"
            width={200}
            height={200}
            className="object-contain"
          />
        </div>

        <h1 className="text-7xl font-bold text-white mb-2">404</h1>
        <h2 className="text-2xl font-medium text-zinc-300 mb-8">
          Orpheus cant read maps
        </h2>

        <p className="text-lg text-zinc-400 mb-4 max-w-md mx-auto">
          This page doesn't exist? Or does it? Either way, you've ventured into
          uncharted territory.
        </p>
        <p className="text-base text-zinc-500 mb-12 max-w-md mx-auto italic">
          (Seriously though, lets go back somewhere that exists.)
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
          >
            <HiHome className="w-5 h-5" />
            <span>Take me home</span>
          </Link>
          <Link
            href="/events"
            className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg transition-colors"
          >
            <span>Browse events</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
