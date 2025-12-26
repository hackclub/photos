import type { Metadata } from "next";
import SearchClient from "@/app/search/SearchClient";
import { getSession } from "@/lib/auth";
import { getUserContext } from "@/lib/policy";
export const metadata: Metadata = {
  title: "Search | Hack Club Photos",
  description: "Search for photos and videos",
  openGraph: {
    images: ["/api/og?type=search"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/api/og?type=search"],
  },
};
interface Props {
  searchParams: Promise<{
    q?: string;
  }>;
}
export default async function SearchPage({ searchParams }: Props) {
  const session = await getSession();
  const { q } = await searchParams;
  const query = q || "";
  const ctx = await getUserContext(session?.id);
  return (
    <SearchClient
      initialQuery={query}
      currentUserId={session?.id}
      isAdmin={ctx?.isGlobalAdmin || false}
    />
  );
}
