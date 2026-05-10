import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/80 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600/10 text-3xl font-black text-red-500">
          HC
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
