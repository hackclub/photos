import { HiArrowLeftOnRectangle } from "react-icons/hi2";

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
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-zinc-800 text-red-600">
            <HiArrowLeftOnRectangle className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-white">Log in</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Sign in with your Hack Club account
          </p>
          <a
            href={`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-red-700"
          >
            <HiArrowLeftOnRectangle className="h-5 w-5" />
            Log in with Hack Club
          </a>
        </div>
      </div>
    </div>
  );
}
