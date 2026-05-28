import { redirect } from "next/navigation";
import { createMobileToken, getSession } from "@/lib/auth";

const defaultReturnTo = "hackclub-photos://auth";

function getSafeReturnTo(value: string | undefined) {
  if (!value) return defaultReturnTo;
  try {
    const url = new URL(value);
    if (["hackclub-photos:", "exp:", "exps:"].includes(url.protocol)) {
      return value;
    }
  } catch {
    return defaultReturnTo;
  }
  return defaultReturnTo;
}

export default async function MobileLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const safeReturnTo = getSafeReturnTo(returnTo);
  const session = await getSession();
  if (!session) {
    const callbackUrl = `/auth/mobile-login?returnTo=${encodeURIComponent(safeReturnTo)}`;
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  const token = await createMobileToken(session);
  const redirectUrl = new URL(safeReturnTo);
  redirectUrl.searchParams.set("token", token);
  redirect(redirectUrl.toString());
}
