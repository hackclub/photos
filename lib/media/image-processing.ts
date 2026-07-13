import sharp, { type SharpOptions } from "sharp";
import { createLimiter } from "@/lib/concurrency";

export const MAX_IMAGE_PIXELS = 64_000_000;
export const MAX_BUFFERED_IMAGE_BYTES = 64 * 1024 * 1024;

const MAX_CONCURRENT_IMAGE_JOBS = 2;
const configuredSharpTimeout = Number(process.env.SHARP_TIMEOUT_SECONDS ?? 30);
const sharpTimeoutSeconds = Number.isFinite(configuredSharpTimeout)
  ? Math.max(5, Math.min(120, Math.floor(configuredSharpTimeout)))
  : 30;

sharp.cache({ memory: 32, files: 0, items: 64 });
sharp.concurrency(MAX_CONCURRENT_IMAGE_JOBS);

export const withImageProcessingSlot = createLimiter(
  MAX_CONCURRENT_IMAGE_JOBS,
  8,
  "Image processing",
  "image-processing",
);

export const withMediaBufferingSlot = createLimiter(
  4,
  16,
  "Media buffering",
  "media-buffering",
);

export const withVideoStagingSlot = createLimiter(
  1,
  4,
  "Video processing",
  "video-staging",
);

export function createSharp(
  input?: Parameters<typeof sharp>[0],
  options: SharpOptions = {},
) {
  return sharp(input, {
    ...options,
    limitInputPixels: options.limitInputPixels ?? MAX_IMAGE_PIXELS,
  }).timeout({ seconds: sharpTimeoutSeconds });
}

export default sharp;
