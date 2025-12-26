import { notFound } from "next/navigation";
import { signage } from "@/flags";
export default async function SignageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isEnabled = await signage();
  if (!isEnabled) {
    notFound();
  }
  return <>{children}</>;
}
