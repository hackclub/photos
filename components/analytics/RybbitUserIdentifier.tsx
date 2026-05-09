"use client";

import { useEffect, useRef } from "react";
import type { SessionUser } from "@/lib/auth";

type RybbitProperties = Record<string, string | number | boolean | null>;

type RybbitApi = {
  identify?: (userId: string, traits?: RybbitProperties) => void;
  setTraits?: (traits: RybbitProperties) => void;
  clearUserId?: () => void;
  event?: (name: string, properties?: RybbitProperties) => void;
};

declare global {
  interface Window {
    rybbit?: RybbitApi;
  }
}

function getUserTraits(user: SessionUser): RybbitProperties {
  return {
    username: user.handle ?? user.name,
    name: user.name,
    email: user.email,
    handle: user.handle ?? null,
    hackclub_id: user.hackclubId,
    slack_id: user.slackId ?? null,
    is_global_admin: user.isGlobalAdmin,
    has_admin_access: user.hasAdminAccess ?? false,
    is_banned: user.isBanned ?? false,
  };
}

function withRybbit(callback: (rybbit: RybbitApi) => void, attempts = 20) {
  if (typeof window === "undefined") return;
  if (window.rybbit) {
    callback(window.rybbit);
    return;
  }
  if (attempts <= 0) return;
  window.setTimeout(() => withRybbit(callback, attempts - 1), 250);
}

export function identifyRybbitUser(user: SessionUser) {
  withRybbit((rybbit) => {
    rybbit.identify?.(user.id, getUserTraits(user));
  });
}

export function clearRybbitUser() {
  withRybbit((rybbit) => {
    rybbit.clearUserId?.();
  });
}

export function trackRybbitEvent(name: string, properties?: RybbitProperties) {
  withRybbit((rybbit) => {
    rybbit.event?.(name, properties);
  });
}

export default function RybbitUserIdentifier({
  user,
  loading,
}: {
  user: SessionUser | null;
  loading: boolean;
}) {
  const identifiedUserIdRef = useRef<string | null>(null);
  const clearedRef = useRef(false);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (!clearedRef.current) {
        clearRybbitUser();
        clearedRef.current = true;
      }
      identifiedUserIdRef.current = null;
      return;
    }

    clearedRef.current = false;
    identifyRybbitUser(user);

    if (identifiedUserIdRef.current !== user.id) {
      trackRybbitEvent("user_session_identified", {
        user_id: user.id,
        handle: user.handle ?? null,
        slack_id: user.slackId ?? null,
        has_admin_access: user.hasAdminAccess ?? false,
      });
      identifiedUserIdRef.current = user.id;
    }
  }, [loading, user]);

  return null;
}
