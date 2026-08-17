"use client";
import { track } from "@vercel/analytics";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { SessionUser } from "@/lib/auth";
import { logger } from "@/lib/client-logger";

interface AuthContextType {
  user: SessionUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refreshUser: async () => {},
  signOut: async () => {},
});
export function useAuth() {
  return useContext(AuthContext);
}
export function AuthProvider({
  children,
  initialSession = null,
}: {
  children: React.ReactNode;
  initialSession?: SessionUser | null;
}) {
  const [user, setUser] = useState<SessionUser | null>(initialSession);
  const [loading, setLoading] = useState(initialSession === undefined);
  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      if (data.user?.isBanned) {
        await fetch("/api/auth/signout", { method: "POST" });
        setUser(null);
        if (window.location.pathname !== "/banned") {
          window.location.href = "/banned";
        }
        return;
      }
      setUser(data.user || null);
    } catch (error) {
      logger.error("Failed to fetch user session:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);
  const signOut = async () => {
    track("user_logout");
    await fetch("/api/auth/signout", { method: "POST" });
    setUser(null);
    window.location.href = "/";
  };
  return (
    <AuthContext.Provider
      value={{ user, loading, refreshUser: fetchUser, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
