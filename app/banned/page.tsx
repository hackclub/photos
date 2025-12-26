"use client";
import { GiHammerDrop } from "react-icons/gi";
import { HiArrowRightOnRectangle } from "react-icons/hi2";
import { useAuth } from "@/hooks/useAuth";
export default function BannedPage() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-zinc-900 rounded-lg p-8 border border-zinc-800 shadow-xl">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-red-600/10 flex items-center justify-center animate-in fade-in zoom-in duration-300">
              <GiHammerDrop className="w-10 h-10 text-red-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-4">
            You have been banned.
          </h1>

          <p className="text-zinc-400 mb-8">
            Contact an admin if you believe this is a mistake.
          </p>

          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <HiArrowRightOnRectangle className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
