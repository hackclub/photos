"use client";
import Link from "next/link";
import { HiHome, HiShieldExclamation } from "react-icons/hi2";
export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-8 flex justify-center">
          <HiShieldExclamation className="w-24 h-24 text-red-600" />
        </div>

        <h1 className="text-7xl font-bold text-white mb-2">403</h1>
        <h2 className="text-2xl font-medium text-zinc-300 mb-8">
          Heidi is blocking the door
        </h2>

        <p className="text-lg text-zinc-400 mb-4 max-w-md mx-auto">
          Heidi demands cookies, orpheus wants a rock. <br />
          You got neither, so no admin access for you {"</3"}
        </p>
        <p className="text-base text-zinc-500 mb-12 max-w-md mx-auto italic">
          (This is admin-only territory, offer snacks to negotiate!)
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
        >
          <HiHome className="w-5 h-5" />
          <span>Retreat to safety</span>
        </Link>
      </div>
    </div>
  );
}
