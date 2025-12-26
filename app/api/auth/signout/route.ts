import { NextResponse } from "next/server";
import { deleteOnboardingSession, deleteSession } from "@/lib/auth";
export async function GET() {
  await deleteSession();
  await deleteOnboardingSession();
  return NextResponse.redirect(new URL("/", process.env.NEXTAUTH_URL));
}
export async function POST() {
  await deleteSession();
  await deleteOnboardingSession();
  return NextResponse.json({ success: true });
}
