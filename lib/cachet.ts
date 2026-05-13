import { CACHET_API_URL } from "@/lib/constants";
import { logger } from "@/lib/logger";
export interface CachetUser {
  id: string;
  userId: string;
  displayName: string;
  pronouns: string;
  imageUrl: string;
}
export async function getCachetUser(
  slackId: string,
): Promise<CachetUser | null> {
  try {
    const response = await fetch(`${CACHET_API_URL}/users/${slackId}`, {
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      logger.error(
        `Cachet API error: ${response.status} ${response.statusText}`,
      );
      return null;
    }
    const data = await response.json();
    return data as CachetUser;
  } catch (error) {
    logger.error("Error fetching Cachet user:", error);
    return null;
  }
}
export function getCachetAvatarUrl(slackId: string): string {
  return `${CACHET_API_URL}/users/${slackId}/r`;
}
