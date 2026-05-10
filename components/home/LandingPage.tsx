import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/80 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-6 h-16 w-16 overflow-hidden">
          <Image
            src="/hackclub-icon.png"
            alt="Hack Club"
            width={64}
            height={64}
            className="h-full w-full object-cover"
            priority
          />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">WIP</h1>
        <p className="mt-3 text-sm text-zinc-400">
          The Landing page is under construction!
        </p>
        <Link prefetch={false} href="/auth/signin"
          className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
