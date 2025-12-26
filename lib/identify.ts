import type { Attributes } from "@flags-sdk/growthbook";
import type { Identify } from "flags";
import { dedupe } from "flags/next";
import { getSession } from "./auth";
export const identify = dedupe(async () => {
  const user = await getSession();
  if (!user) {
    return {
      anonymous: true,
    };
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    hackclubId: user.hackclubId,
    isGlobalAdmin: user.isGlobalAdmin,
    isBanned: user.isBanned,
    slackId: user.slackId,
  };
}) satisfies Identify<Attributes>;
