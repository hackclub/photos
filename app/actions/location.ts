"use server";
import { getSession } from "@/lib/auth";
import { NOMINATIM_API_URL } from "@/lib/constants";
import { getUserContext } from "@/lib/policy";
export async function searchLocation(query: string) {
  if (!query.trim()) return { success: true, locations: [] };
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) {
      return { success: true, locations: [] };
    }
    const response = await fetch(
      `${NOMINATIM_API_URL}/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`,
      {
        headers: {
          "User-Agent": "Hack Club Photos App",
        },
      },
    );
    if (!response.ok) throw new Error("Failed to search location");
    const data = await response.json();
    interface NominatimResult {
      display_name: string;
      address?: {
        city?: string;
        town?: string;
        village?: string;
        county?: string;
        country?: string;
      };
      lat: string;
      lon: string;
    }
    const locations = (data as NominatimResult[]).map((item) => ({
      displayName: item.display_name,
      city:
        item.address?.city ||
        item.address?.town ||
        item.address?.village ||
        item.address?.county ||
        "",
      country: item.address?.country || "",
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    }));
    return { success: true, locations };
  } catch (error) {
    console.error("Error searching location:", error);
    return { success: false, error: "Failed to search location" };
  }
}
