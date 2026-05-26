import Link from "next/link";

export default async function MigratedPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const params = await searchParams;
  const message = params.message
    ? decodeURIComponent(params.message)
    : "Your account has been migrated. Please log in with the new account.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="max-w-md w-full space-y-6 p-8 bg-zinc-900 rounded-lg shadow-xl border border-zinc-800">
        <div>
          <h1 className="text-center text-3xl font-extrabold text-white">
            Account Migrated
          </h1>
          <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-center text-sm text-blue-100">{message}</p>
          </div>
        </div>
        <Link
          prefetch={false}
          href="/auth/signin"
          className="w-full flex justify-center py-3 px-4 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}
