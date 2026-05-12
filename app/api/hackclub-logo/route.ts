import { NextResponse } from "next/server";
import { APP_URL } from "@/lib/constants";

export async function GET() {
  let url = "/hackclub-icon.png";
  try {
    const res = await fetch(
      "https://shrimp-shuffler.a.hackclub.dev/api/current",
      {
        cache: "no-store",
      },
    );
    const fetched = (await res.text()).trim();
    if (fetched) url = fetched;
  } catch (_error) {
    url = "/hackclub-icon.png";
  }
  const response = NextResponse.redirect(new URL(url, APP_URL), 302);
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  return response;
}
