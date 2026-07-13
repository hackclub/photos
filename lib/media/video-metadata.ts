import { Readable } from "node:stream";
import ffmpeg from "fluent-ffmpeg";
import { logger } from "@/lib/logger";
import { MEDIA_PROCESS_TIMEOUT_MS } from "@/lib/media/ffmpeg";
import { withImageProcessingSlot } from "@/lib/media/image-processing";
export interface VideoMetadata {
  [key: string]: unknown;
  duration?: number;
  width?: number;
  height?: number;
  creationTime?: string;
  make?: string;
  model?: string;
  latitude?: number;
  longitude?: number;
}

function toJsonSafeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return value
      .map((item) => toJsonSafeValue(item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const safeObject: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const safeValue = toJsonSafeValue(nestedValue);
      if (safeValue !== undefined) safeObject[key] = safeValue;
    }
    return Object.keys(safeObject).length > 0 ? safeObject : undefined;
  }
  return value;
}
async function extractVideoMetadataInternal(
  input: Buffer | string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<VideoMetadata | null> {
  return new Promise((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: VideoMetadata | null) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      resolve(value);
    };
    let command: ReturnType<typeof ffmpeg> | undefined;
    const abort = () => {
      command?.kill("SIGKILL");
      finish(null);
    };
    try {
      let stream: Readable | string;
      if (Buffer.isBuffer(input)) {
        stream = Readable.from(input);
      } else {
        stream = input;
      }
      command = ffmpeg(stream);
      timeout = setTimeout(
        abort,
        options.timeoutMs ?? MEDIA_PROCESS_TIMEOUT_MS,
      );
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) {
        abort();
        return;
      }
      command.ffprobe((err, metadata) => {
        if (err) {
          logger.error("FFprobe error:", err);
          finish(null);
          return;
        }
        const videoStream = metadata.streams.find(
          (s) => s.codec_type === "video",
        );
        const format = metadata.format;
        const formatTags = format.tags || {};
        const streamTags = videoStream?.tags || {};
        const creationTime =
          formatTags.creation_time ||
          streamTags.creation_time ||
          formatTags["com.apple.quicktime.creationdate"] ||
          streamTags["com.apple.quicktime.creationdate"] ||
          formatTags.date ||
          streamTags.date;
        let latitude: number | undefined;
        let longitude: number | undefined;
        const location =
          formatTags["com.apple.quicktime.location.ISO6709"] ||
          streamTags["com.apple.quicktime.location.ISO6709"];
        if (location && typeof location === "string") {
          const match = location.match(/([+-]\d+\.\d+)([+-]\d+\.\d+)/);
          if (match) {
            latitude = parseFloat(match[1]);
            longitude = parseFloat(match[2]);
          }
        }
        const make =
          formatTags["com.apple.quicktime.make"] ||
          streamTags["com.apple.quicktime.make"] ||
          formatTags.make ||
          streamTags.make;
        const model =
          formatTags["com.apple.quicktime.model"] ||
          streamTags["com.apple.quicktime.model"] ||
          formatTags.model ||
          streamTags.model;
        finish({
          duration: format.duration,
          width: videoStream?.width,
          height: videoStream?.height,
          creationTime: creationTime
            ? new Date(creationTime).toISOString()
            : undefined,
          make,
          model,
          latitude,
          longitude,
          formatName: format.format_name,
          formatLongName: format.format_long_name,
          bitrate: format.bit_rate,
          codecName: videoStream?.codec_name,
          codecLongName: videoStream?.codec_long_name,
          pixelFormat: videoStream?.pix_fmt,
          rotation: videoStream?.rotation,
          formatTags: toJsonSafeValue(formatTags),
          streamTags: toJsonSafeValue(streamTags),
        });
      });
    } catch (error) {
      logger.error("Video metadata extraction error:", error);
      finish(null);
    }
  });
}

export async function extractVideoMetadata(
  input: Buffer | string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<VideoMetadata | null> {
  return await withImageProcessingSlot(
    () => extractVideoMetadataInternal(input, options),
    options.signal,
  );
}
