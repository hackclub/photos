import type { Metadata } from "next";
import PhoneFaceCapture from "@/components/face/PhoneFaceCapture";

export const metadata: Metadata = {
  title: "Complete face scan | Hack Club Photos",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function FaceCapturePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PhoneFaceCapture token={token} />;
}
