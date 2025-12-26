import { type NextRequest, NextResponse } from "next/server";
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const params = new URLSearchParams({
    client_id: process.env.HACKCLUB_CLIENT_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback`,
    response_type: "code",
    scope: "email name slack_id verification_status",
    state: callbackUrl,
  });
  const authUrl = `https://account.hackclub.com/oauth/authorize?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}
