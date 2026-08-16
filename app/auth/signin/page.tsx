import Image from "next/image";

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
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <Image
          src="/hackclub-icon.png"
          alt="Hack Club"
          width={72}
          height={72}
          className="rounded-2xl"
          priority
        />
        <h1 className="mt-6 text-2xl font-bold text-white">Hack Club Photos</h1>
        <a
          href={`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="mt-10 inline-flex w-full items-center justify-center rounded-lg bg-red-600 px-6 py-4 text-lg font-semibold text-white transition-colors hover:bg-red-700"
        >
          Log in with Hack Club
        </a>
      </div>
    </div>
  );
}
