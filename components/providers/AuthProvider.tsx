"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { SessionUser } from "@/lib/auth";

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
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
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
      console.error("Failed to fetch user session:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);
  const signOut = async () => {
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
