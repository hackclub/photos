import { NextResponse } from "next/server";
import { deleteOnboardingSession, deleteSession } from "@/lib/auth";
export async function POST() {
  await deleteSession();
  await deleteOnboardingSession();
  return NextResponse.json({ success: true });
}
