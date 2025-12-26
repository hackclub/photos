import Link from "next/link";
import {
  HiArrowLeftOnRectangle,
  HiCalendar,
  HiCamera,
  HiHeart,
} from "react-icons/hi2";
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
  }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl || "/";
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-zinc-800 border-2 border-zinc-700 rounded-lg flex items-center justify-center">
              <HiArrowLeftOnRectangle className="w-10 h-10 text-red-600" />
            </div>
          </div>

          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">
              Welcome to Hack Club Photos
            </h1>
            <p className="text-zinc-400 mb-1">
              The photo hub for teenage hackers
            </p>
            <p className="text-sm text-zinc-500">
              For Hack Club members under 18
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 bg-zinc-800 rounded-lg flex items-center justify-center">
                <HiCamera className="w-6 h-6 text-zinc-400" />
              </div>
              <p className="text-xs text-zinc-500">Upload Photos</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 bg-zinc-800 rounded-lg flex items-center justify-center">
                <HiCalendar className="w-6 h-6 text-zinc-400" />
              </div>
              <p className="text-xs text-zinc-500">Event Memories</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 bg-zinc-800 rounded-lg flex items-center justify-center">
                <HiHeart className="w-6 h-6 text-zinc-400" />
              </div>
              <p className="text-xs text-zinc-500">Like & Comment</p>
            </div>
          </div>

          <Link
            href={`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="w-full block text-center py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors shadow-lg "
            prefetch={false}
          >
            Sign in with Hack Club
          </Link>
        </div>
      </div>
    </div>
  );
}
