import Link from "next/link";
import { HiHome, HiUser } from "react-icons/hi2";
export default function UserNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
        <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-6 border-4 border-zinc-900 shadow-xl">
          <HiUser className="w-12 h-12 text-zinc-600" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-1">User Not Found</h1>
        <p className="text-lg text-zinc-500 font-medium mb-6">@deleted</p>

        <p className="text-zinc-400 mb-8">
          This user profile is not available. The account may have been deleted
          or the username is incorrect.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg transition-colors"
        >
          <HiHome className="w-5 h-5" />
          <span>Return Home</span>
        </Link>
      </div>
    </div>
  );
}
