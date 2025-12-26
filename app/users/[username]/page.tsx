import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { HiExclamationCircle } from "react-icons/hi2";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getUserContext } from "@/lib/policy";
import UserProfileClient from "./UserProfileClient";
export async function generateMetadata({
  params,
}: {
  params: Promise<{
    username: string;
  }>;
}) {
  const { username } = await params;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      username,
    );
  const user = await db.query.users.findFirst({
    where: isUuid ? eq(users.id, username) : eq(users.handle, username),
  });
  if (!user) {
    return {
      title: "User Not Found",
    };
  }
  return {
    title: `${user.name} (@${user.handle}) | Hack Club Photos`,
    description: user.bio || `@${user.handle} on Hack Club Photos`,
    openGraph: {
      images: [`/api/og?type=user&id=${username}`],
    },
    twitter: {
      card: "summary_large_image",
      images: [`/api/og?type=user&id=${username}`],
    },
  };
}
export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{
    username: string;
  }>;
  searchParams: Promise<{
    tab?: string;
  }>;
}) {
  const { username } = await params;
  const { tab } = await searchParams;
  const session = await getSession();
  const ctx = await getUserContext(session?.id);
  const isAdmin = ctx?.isGlobalAdmin || false;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      username,
    );
  const userData = await db.query.users.findFirst({
    where: isUuid ? eq(users.id, username) : eq(users.handle, username),
    columns: {
      id: true,
      name: true,
      preferredName: true,
      handle: true,
      email: true,
      createdAt: true,
      isBanned: true,
      bannedAt: true,
      banReason: true,
      deletedAt: true,
      bio: true,
      avatarS3Key: true,
      avatarSource: true,
      socialLinks: true,
      slackId: true,
      storageLimit: true,
      isGlobalAdmin: true,
    },
  });
  const user = userData
    ? {
        ...userData,
        socialLinks: userData.socialLinks as Record<string, string> | null,
        storageLimit: userData.storageLimit
          ? Number(userData.storageLimit)
          : undefined,
      }
    : undefined;
  if (!user || user.deletedAt) {
    notFound();
  }
  if (user.isBanned) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
          <div className="w-24 h-24 rounded-full bg-red-600/10 flex items-center justify-center mx-auto mb-6 border-4 border-zinc-900 shadow-xl">
            <HiExclamationCircle className="w-12 h-12 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">User Banned</h1>
          {user.handle && (
            <p className="text-lg text-zinc-500 font-medium mb-6">
              @{user.handle}
            </p>
          )}
          <p className="text-zinc-400 mb-8">
            This user has been banned from Hack Club Photos.
          </p>
          {user.banReason && (
            <div className="bg-black/50 rounded-lg p-4 text-sm text-zinc-300 border border-zinc-800">
              <span className="font-medium text-zinc-500 block mb-1 uppercase text-xs tracking-wider">
                Reason
              </span>
              {user.banReason}
            </div>
          )}
        </div>
      </div>
    );
  }
  const isOwnProfile = session?.id === user.id;
  return (
    <UserProfileClient
      user={user}
      currentUserId={session?.id}
      isOwnProfile={isOwnProfile}
      initialTab={tab || "uploads"}
      isAdmin={isAdmin}
    />
  );
}
