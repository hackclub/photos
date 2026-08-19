import "server-only";

import {
  createSharp,
  withImageProcessingSlot,
} from "@/lib/media/image-processing";
import { getSignedDownloadUrl } from "@/lib/media/s3";

export type BlurRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function recommendBlurIntensity(
  regions: BlurRegion[],
  imageWidth: number,
  imageHeight: number,
) {
  const largest = regions.reduce(
    (result, region) => {
      const width = region.width * imageWidth;
      const height = region.height * imageHeight;
      return result.dimension > Math.max(width, height)
        ? result
        : {
            area: region.width * region.height,
            dimension: Math.max(width, height),
          };
    },
    { area: 0, dimension: 0 },
  );
  if (largest.dimension === 0) return 8;
  const sizeScore = Math.log2(largest.dimension / 160) * 2.5;
  const areaScore = largest.area > 0.12 ? 1 : largest.area > 0.05 ? 0.5 : 0;
  const resolutionScore = Math.max(
    0,
    Math.log2(Math.max(imageWidth, imageHeight) / 1800),
  );
  return Math.max(
    4,
    Math.min(16, Math.round(7 + sizeScore + areaScore + resolutionScore)),
  );
}

async function readResponseBuffer(response: Response) {
  if (!response.body) throw new Error("Source photo had no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 50 * 1024 * 1024) {
        await reader.cancel("Source photo exceeds processing limit");
        throw new Error("Source photo exceeds the server processing limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export async function createBlurThumbnail(buffer: Buffer) {
  return await withImageProcessingSlot(() =>
    createSharp(buffer)
      .resize(400, 400, { fit: "cover", position: "center" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer(),
  );
}

export async function renderBlurredPhoto(
  sourceKey: string,
  regions: BlurRegion[],
  intensity?: number,
  mimeType = "image/jpeg",
) {
  return await withImageProcessingSlot(async () => {
    const sourceUrl = await getSignedDownloadUrl(sourceKey);
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error("Failed to fetch source photo");
    const input = await readResponseBuffer(response);
    const base = await createSharp(input).rotate().withMetadata({}).toBuffer();
    const metadata = await createSharp(base).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (!width || !height) throw new Error("Invalid source photo");
    const effectiveIntensity =
      intensity ?? recommendBlurIntensity(regions, width, height);
    const overlays: { input: Buffer; left: number; top: number }[] = [];
    for (const region of regions) {
      const left = Math.max(
        0,
        Math.min(width - 1, Math.floor(region.x * width)),
      );
      const top = Math.max(
        0,
        Math.min(height - 1, Math.floor(region.y * height)),
      );
      const right = Math.max(
        0,
        Math.min(width, Math.ceil((region.x + region.width) * width)),
      );
      const bottom = Math.max(
        0,
        Math.min(height, Math.ceil((region.y + region.height) * height)),
      );
      if (right <= left || bottom <= top) continue;
      const boxWidth = right - left;
      const boxHeight = bottom - top;
      const inputBuffer = await createSharp(base)
        .extract({ left, top, width: boxWidth, height: boxHeight })
        .resize(
          Math.max(1, Math.floor(boxWidth / 64)),
          Math.max(1, Math.floor(boxHeight / 64)),
          { kernel: "nearest" },
        )
        .resize(boxWidth, boxHeight, { kernel: "nearest" })
        .blur(Math.max(40, effectiveIntensity * 6))
        .toBuffer();
      overlays.push({ input: inputBuffer, left, top });
    }
    const composited = overlays.length
      ? await createSharp(base).composite(overlays).keepMetadata().toBuffer()
      : base;
    const output = createSharp(composited).keepMetadata();
    if (mimeType === "image/png")
      return { buffer: await output.png().toBuffer(), mimeType };
    if (mimeType === "image/webp")
      return {
        buffer: await output.webp({ quality: 90 }).toBuffer(),
        mimeType,
      };
    return {
      buffer: await output.jpeg({ quality: 95, mozjpeg: true }).toBuffer(),
      mimeType: "image/jpeg",
    };
  });
}
