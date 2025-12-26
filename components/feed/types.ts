export type FeedItemType = {
  id: string;
  type: "photo" | "comment" | "like";
  timestamp: Date;
  event?: {
    id: string;
    name: string;
    slug: string;
    visibility: string;
  };
  user: {
    id: string;
    email: string;
    slackId: string | null;
    name: string;
    avatarS3Key?: string | null;
    handle?: string | null;
  };
  media?: {
    id: string;
    filename: string;
    s3Url: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    thumbnailS3Key?: string | null;
    exifData: Record<string, unknown> | null;
    uploadedAt: Date;
    uploadedBy: {
      id: string;
      name: string;
      handle?: string | null;
      avatarS3Key?: string | null;
      slackId?: string | null;
    };
    caption?: string | null;
    likeCount?: number;
    commentCount?: number;
    canDelete?: boolean;
  };
  comment?: {
    id: string;
    content: string;
    mediaId: string;
  };
};
