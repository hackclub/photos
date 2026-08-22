export interface MediaItem {
  id: string;
  s3Url: string;
  s3Key?: string;
  thumbnailS3Key: string | null;
  filename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  duration?: number | null;
  exifData: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  uploadedAt: Date;
  eventId?: string;
  event?: {
    id: string;
    name: string;
    slug: string;
    visibility?: "public" | "unlisted" | "auth_required";
  };
  uploadedBy: {
    id: string;
    name: string;
    handle?: string | null;
    slackId?: string | null;
    avatarUrl?: string | null;
  };
  likeCount?: number;
  caption?: string | null;
  canDelete?: boolean;
  suggestedMention?: boolean;
  suggestionId?: string;
  canConfirmSuggestion?: boolean;
  apiKeyId?: string | null;
  apiKey?: {
    id: string;
    name: string | null;
  } | null;
}
export interface Event {
  id: string;
  name: string;
  slug: string;
  visibility?: "public" | "unlisted" | "auth_required";
}
