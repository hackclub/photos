import { jwtVerify } from "jose";
import { type NextRequest, NextResponse } from "next/server";

const nextAuthSecret = process.env.NEXTAUTH_SECRET;
const JWT_SECRET = new TextEncoder().encode(nextAuthSecret || "dev-insecure");

const AUTH_REQUIRED_PATHS = [
  "/admin",
  "/api/data-export",
  "/api/events",
  "/api/feed",
  "/developer",
  "/events",
  "/feed",
  "/map",
  "/search",
  "/series",
  "/settings",
  "/tags",
  "/users",
];

const MEDIA_BYPASS_PATHS = ["/assets", "/media"];

function matchesPath(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function redirectToSignin(request: NextRequest) {
  if (isApiPath(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = "/auth/signin";
  url.search = "";
  url.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(url);
}

function forbidden(request: NextRequest) {
  if (isApiPath(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/unauthorized";
  url.search = "";
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (matchesPath(pathname, MEDIA_BYPASS_PATHS)) {
    return NextResponse.next();
  }

  const needsAuth = matchesPath(pathname, AUTH_REQUIRED_PATHS);

  if (!needsAuth) {
    return NextResponse.next();
  }

  const token = request.cookies.get("session")?.value;
  if (!token) {
    return redirectToSignin(request);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const session = payload.user as
      | { isGlobalAdmin?: boolean; isBanned?: boolean }
      | undefined;

    if (!session || session.isBanned) {
      return forbidden(request);
    }

    return NextResponse.next();
  } catch (_error) {
    return redirectToSignin(request);
  }
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/data-export/:path*",
    "/api/events/:path*",
    "/api/feed/:path*",
    "/developer/:path*",
    "/events/:path*",
    "/feed/:path*",
    "/map/:path*",
    "/search/:path*",
    "/series/:path*",
    "/settings/:path*",
    "/tags/:path*",
    "/users/:path*",
  ],
};
