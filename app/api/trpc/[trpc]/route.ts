import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";
import { appRouter, createTRPCContext } from "@/lib/trpc/router";

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
    responseMeta({ ctx, paths }) {
      const headers: Record<string, string> = {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie, Authorization",
      };

      if (paths?.includes("mobile.webSession") && ctx?.token) {
        headers["Set-Cookie"] = [
          `session=${encodeURIComponent(ctx.token)}`,
          "Path=/",
          "HttpOnly",
          "SameSite=Lax",
          "Max-Age=31536000",
          process.env.NODE_ENV === "production" ? "Secure" : "",
        ]
          .filter(Boolean)
          .join("; ");
      }

      return {
        headers,
      };
    },
  });

export { handler as GET, handler as POST };
