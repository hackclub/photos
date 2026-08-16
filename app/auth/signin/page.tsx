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
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <h1 className="text-2xl font-bold text-white">Hack Club Photos</h1>
        <a
          href={`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="mt-8 inline-flex w-full items-center justify-center rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-red-700"
        >
          Log in with Hack Club
        </a>
      </div>
    </div>
  );
}
