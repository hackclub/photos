import { redirect } from "next/navigation";
import { createMobileToken, getSession } from "@/lib/auth";
export default async function MobileLoginPage() {
  const session = await getSession();
  if (!session) {
    redirect("/auth/signin?callbackUrl=/auth/mobile-login");
  }
  const token = await createMobileToken(session);
  redirect(`hackclub-photos://auth?token=${token}`);
}
