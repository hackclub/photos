import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type MediaImageSize = "sm" | "md" | "lg";
export type MediaVariant = "original" | "thumbnail";
export type MediaImageFormat = "jpg" | "avif";

export const MEDIA_IMAGE_SIZES: MediaImageSize[] = ["sm", "md", "lg"];
export const MEDIA_IMAGE_FORMATS: MediaImageFormat[] = ["jpg", "avif"];

const signingKey = createHash("sha256")
  .update(`media-access-v1:${process.env.NEXTAUTH_SECRET || "dev-insecure"}`)
  .digest();

function accessPayload(
  mediaId: string,
  variant: MediaVariant,
  size?: MediaImageSize | null,
  format?: MediaImageFormat | null,
) {
  const base = `${mediaId}\n${variant}\n${size ?? ""}`;
  return format ? `${base}\n${format}` : base;
}

export function signMediaAccess(
  mediaId: string,
  variant: MediaVariant,
  size?: MediaImageSize | null,
  format?: MediaImageFormat | null,
): string {
  return createHmac("sha256", signingKey)
    .update(accessPayload(mediaId, variant, size, format))
    .digest("base64url");
}

export function verifyMediaAccess(
  mediaId: string,
  variant: MediaVariant,
  size: MediaImageSize | null | undefined,
  signature: string | null | undefined,
  format?: MediaImageFormat | null,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(
    signMediaAccess(mediaId, variant, size, format),
    "utf8",
  );
  const provided = Buffer.from(signature, "utf8");
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

export function parseMediaImageSize(
  value: string | null | undefined,
): MediaImageSize | null {
  return value === "sm" || value === "md" || value === "lg" ? value : null;
}

export function parseMediaImageFormat(
  value: string | null | undefined,
): MediaImageFormat | null {
  return value === "jpg" || value === "avif" ? value : null;
}

function signedMediaUrl(
  mediaId: string,
  variant: MediaVariant,
  size?: MediaImageSize | null,
  format?: MediaImageFormat | null,
): string {
  const base =
    variant === "thumbnail"
      ? `/media/${mediaId}/thumbnail`
      : `/media/${mediaId}`;
  const params = new URLSearchParams({
    sig: signMediaAccess(mediaId, variant, size ?? null, format ?? null),
  });
  if (size) params.set("size", size);
  if (format) params.set("fmt", format);
  return `${base}?${params.toString()}`;
}

export function getMediaThumbnailUrl(
  mediaId: string,
  size: Extract<MediaImageSize, "sm" | "md"> = "sm",
  format: MediaImageFormat | null = null,
): string {
  return signedMediaUrl(
    mediaId,
    "thumbnail",
    size,
    format === "avif" ? "avif" : null,
  );
}

export function getMediaDisplayUrl(
  mediaId: string,
  format: MediaImageFormat = "jpg",
): string {
  return signedMediaUrl(
    mediaId,
    "original",
    "lg",
    format === "avif" ? "avif" : null,
  );
}
