export const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
export const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024;
export const MAX_BANNER_SIZE = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
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

const UNSUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
const UNSUPPORTED_MAJOR_BRANDS = new Set(["heic", "heix", "hevc", "hevx"]);
const UNSUPPORTED_COMPATIBLE_BRANDS = new Set(["heic", "heix", "hevc", "hevx"]);

type MediaFileDescriptor = {
  type: string;
  size: number;
  name?: string;
};

function readBrand(data: Uint8Array, offset: number) {
  if (offset + 4 > data.length) return "";
  return String.fromCharCode(
    data[offset],
    data[offset + 1],
    data[offset + 2],
    data[offset + 3],
  );
}

export function hasUnsupportedImageIdentity(
  file: Pick<MediaFileDescriptor, "type" | "name">,
) {
  const mimeType = file.type.split(";")[0]?.trim().toLowerCase();
  return (
    UNSUPPORTED_IMAGE_MIME_TYPES.has(mimeType) ||
    /\.(heic|heif)$/i.test(file.name?.trim() ?? "")
  );
}

export function isUnsupportedImageBuffer(data: Uint8Array) {
  if (data.length < 12 || readBrand(data, 4) !== "ftyp") return false;
  if (UNSUPPORTED_MAJOR_BRANDS.has(readBrand(data, 8))) return true;
  const boxSize =
    data[0] * 0x1000000 + data[1] * 0x10000 + data[2] * 0x100 + data[3];
  const boxEnd = Math.min(data.length, boxSize >= 16 ? boxSize : 16, 4096);
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    if (UNSUPPORTED_COMPATIBLE_BRANDS.has(readBrand(data, offset))) return true;
  }
  return false;
}
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
export function validateMediaFile(file: MediaFileDescriptor) {
  if (hasUnsupportedImageIdentity(file)) {
    return {
      valid: false,
      error:
        "Unsupported image format. Convert the file to JPEG before uploading.",
    };
  }
  const mimeType = file.type.split(";")[0]?.trim().toLowerCase();
  const isImage = ALLOWED_IMAGE_TYPES.includes(mimeType);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(mimeType);
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
