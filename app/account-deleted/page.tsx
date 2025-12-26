import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HiCheckCircle, HiHome } from "react-icons/hi2";
export default async function AccountDeletedPage() {
  const cookieStore = await cookies();
  const hasDeletedCookie = cookieStore.get("account_deleted");
  if (!hasDeletedCookie) {
    redirect("/");
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-black">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-20 h-20 rounded-full bg-green-900/20 flex items-center justify-center mx-auto mb-6">
          <HiCheckCircle className="w-10 h-10 text-green-500" />
        </div>

        <h1 className="text-3xl font-bold text-white mb-4">Account Deleted</h1>

        <p className="text-zinc-400 mb-8">
          Your account and all associated data have been permanently deleted...
          :C
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-black hover:bg-zinc-200 rounded-xl font-medium transition-colors w-full"
        >
          <HiHome className="w-5 h-5" />
          Return Home
        </Link>
      </div>
    </div>
  );
}
