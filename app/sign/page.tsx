import Link from "next/link";
import { HiPhoto, HiRss } from "react-icons/hi2";
export default async function SignPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl md:text-6xl font-bold mb-12 tracking-tight">
        Big Screens for Events
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
        <Link
          href="/sign/random"
          className="group relative overflow-hidden rounded-3xl bg-zinc-900 border border-zinc-800 p-8 hover:bg-zinc-800 transition-all duration-300 flex flex-col items-center text-center aspect-square justify-center"
        >
          <div className="mb-6 p-6 rounded-full bg-red-600/10 text-red-600 group-hover:scale-110 transition-transform duration-300">
            <HiPhoto className="w-16 h-16" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Random Photos</h2>
          <p className="text-zinc-400 text-lg">
            Shuffles through all photos you got access to.
          </p>
        </Link>

        <Link
          href="/sign/feed"
          className="group relative overflow-hidden rounded-3xl bg-zinc-900 border border-zinc-800 p-8 hover:bg-zinc-800 transition-all duration-300 flex flex-col items-center text-center aspect-square justify-center"
        >
          <div className="mb-6 p-6 rounded-full bg-red-600/10 text-red-600 group-hover:scale-110 transition-transform duration-300">
            <HiRss className="w-16 h-16" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Live Feed</h2>
          <p className="text-zinc-400 text-lg">
            Show new photos in real-time as they are uploaded.
          </p>
        </Link>
      </div>

      <div className="mt-12 text-zinc-500">
        <Link href="/" className="hover:text-white transition-colors">
          &larr; Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
