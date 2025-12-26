export const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
export const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024;
export const MAX_BANNER_SIZE = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
];
export const ALLOWED_BANNER_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
];
export function validateBannerFile(file: File) {
  if (!ALLOWED_BANNER_TYPES.includes(file.type)) {
    return {
      valid: false,
      error:
        "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed for banners.",
    };
  }
  if (file.size > MAX_BANNER_SIZE) {
    return { valid: false, error: "File too large (max 10MB)" };
  }
  return { valid: true };
}
export function validateMediaFile(file: File) {
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) {
    return {
      valid: false,
      error: "Invalid file type. Only images and videos are allowed.",
    };
  }
  if (isImage && file.size > MAX_IMAGE_SIZE) {
    return {
      valid: false,
      error: `Image too large (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`,
    };
  }
  if (isVideo && file.size > MAX_VIDEO_SIZE) {
    return {
      valid: false,
      error: `Video too large (max ${MAX_VIDEO_SIZE / 1024 / 1024 / 1024}GB)`,
    };
  }
  return { valid: true, isImage, isVideo };
}
