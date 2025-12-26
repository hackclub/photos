export interface MediaItem {
  id: string;
  s3Url: string;
  thumbnailS3Key: string | null;
  filename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  exifData: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  uploadedAt: Date;
  eventId?: string;
  event?: {
    id: string;
    name: string;
    slug: string;
  };
  uploadedBy: {
    id: string;
    name: string;
    email?: string;
    avatarS3Key?: string | null;
    handle?: string | null;
    slackId?: string | null;
  };
  likeCount?: number;
  caption?: string | null;
  canDelete?: boolean;
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
}
