import type { Identify } from "flags";
import { dedupe } from "flags/next";
import { getSession } from "./auth";

export type FlagEntities = {
  user?: {
    id: string;
    email: string;
    name: string;
    hackclubId: string;
    isGlobalAdmin: boolean;
    isBanned?: boolean;
    slackId?: string | null;
  };
};

export const identify = dedupe(async (): Promise<FlagEntities> => {
  const user = await getSession();
  if (!user) return {};
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      hackclubId: user.hackclubId,
      isGlobalAdmin: user.isGlobalAdmin,
      isBanned: user.isBanned,
      slackId: user.slackId,
    },
  };
}) satisfies Identify<FlagEntities>;
