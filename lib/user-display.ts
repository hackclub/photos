import { CACHET_API_URL } from "@/lib/constants";

export const DEFAULT_USER_HANDLE = "New user";

export function getSlackAvatarUrl(slackId?: string | null) {
  if (!slackId) return null;
  return `${CACHET_API_URL}/users/${encodeURIComponent(slackId)}/r`;
}

type DisplayableUser = {
  handle?: string | null;
  preferredName?: string | null;
};

export function getUserHandle(user?: DisplayableUser | null) {
  const handle = user?.handle?.trim();
  return handle || DEFAULT_USER_HANDLE;
}

export function getUserDisplayName(user?: DisplayableUser | null) {
  const preferredName = user?.preferredName?.trim();
  return preferredName || getUserHandle(user);
}

type PublicUserInput = DisplayableUser & {
  id: string;
  slackId?: string | null;
  isGlobalAdmin?: boolean;
};

export function toPublicUser(user: PublicUserInput) {
  return {
    id: user.id,
    name: getUserDisplayName(user),
    handle: user.handle ?? null,
    slackId: user.slackId ?? null,
    avatarUrl: getSlackAvatarUrl(user.slackId),
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
