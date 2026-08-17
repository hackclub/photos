import type { FileHandle } from "node:fs/promises";
import { open } from "node:fs/promises";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { MediaInfoResult } from "mediainfo.js";
import { mediaInfoFactory } from "mediainfo.js";
import { logger } from "@/lib/logger";
import { withImageProcessingSlot } from "@/lib/media/image-processing";
import { S3_BUCKET_NAME, s3Client } from "@/lib/media/s3";

export const MEDIA_PROCESS_TIMEOUT_MS = 45_000;

const ANALYZE_CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_URL_METADATA_BYTES = 1024 * 1024 * 1024;

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
  formatName?: string;
  formatLongName?: string;
  bitrate?: number;
  codecName?: string;
  codecLongName?: string;
  pixelFormat?: string;
  rotation?: number | string;
  frameRate?: number;
  frameCount?: number;
  formatTags?: Record<string, unknown>;
  streamTags?: Record<string, unknown>;
}

interface ByteSource {
  size(): number | Promise<number>;
  read(offset: number, length: number): Uint8Array | Promise<Uint8Array>;
  close?(): Promise<void> | void;
}

function memorySource(buffer: Buffer): ByteSource {
  return {
    size: () => buffer.length,
    read: (offset, length) =>
      new Uint8Array(
        buffer.buffer,
        buffer.byteOffset + offset,
        Math.min(length, Math.max(buffer.length - offset, 0)),
      ),
  };
}

function fileSource(filePath: string, signal?: AbortSignal): ByteSource {
  let handlePromise: Promise<FileHandle> | null = null;
  const getHandle = () => {
    if (!handlePromise) {
      handlePromise = open(filePath, "r");
    }
    return handlePromise;
  };
  return {
    size: async () => {
      const handle = await getHandle();
      const stat = await handle.stat();
      return stat.size;
    },
    async read(offset, length) {
      if (signal?.aborted) throw new Error("Media processing aborted");
      const handle = await getHandle();
      const out = Buffer.alloc(length);
      const { bytesRead } = await handle.read(out, 0, length, offset);
      return new Uint8Array(out.buffer, out.byteOffset, bytesRead);
    },
    async close() {
      if (handlePromise) {
        const handle = await handlePromise.catch(() => null);
        await handle?.close().catch(() => {});
        handlePromise = null;
      }
    },
  };
}

async function collectStream(
  body: AsyncIterable<Uint8Array> & { destroy?: (error?: Error) => void },
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    if (signal?.aborted) {
      body.destroy?.(new Error("Media processing aborted"));
      throw new Error("Media processing aborted");
    }
    const typed = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    chunks.push(typed);
    total += typed.length;
  }
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

function s3Source(key: string, signal?: AbortSignal): ByteSource {
  let size: number | null = null;
  return {
    size: async () => {
      if (size != null) return size;
      const response = await s3Client.send(
        new HeadObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key }),
        { abortSignal: signal },
      );
      size = response.ContentLength ?? 0;
      return size;
    },
    async read(offset, length) {
      if (signal?.aborted) throw new Error("Media processing aborted");
      const end = offset + Math.max(length - 1, 0);
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: key,
          Range: `bytes=${offset}-${end}`,
        }),
        { abortSignal: signal },
      );
      if (!response.Body) return new Uint8Array(0);
      return await collectStream(
        response.Body as AsyncIterable<Uint8Array> & {
          destroy?: (error?: Error) => void;
        },
        signal,
      );
    },
  };
}

function urlSource(url: string, signal?: AbortSignal): ByteSource {
  let size: number | null = null;
  const fullBuffer: { value: Uint8Array | null; inFlight: boolean } = {
    value: null,
    inFlight: false,
  };
  const loadFull = async () => {
    if (fullBuffer.value) return fullBuffer.value;
    if (fullBuffer.inFlight) {
      throw new Error("Recursive full download");
    }
    fullBuffer.inFlight = true;
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new Error(`Failed to download media URL (${response.status})`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_URL_METADATA_BYTES) {
        throw new Error("Media URL metadata source exceeds size limit");
      }
      size = bytes.byteLength;
      fullBuffer.value = bytes;
      return bytes;
    } finally {
      fullBuffer.inFlight = false;
    }
  };
  const readFull = (offset: number, length: number) => {
    if (!fullBuffer.value) throw new Error("Full media buffer not loaded");
    return fullBuffer.value.slice(offset, offset + length);
  };
  return {
    size: async () => {
      if (size != null) return size;
      if (fullBuffer.value) return fullBuffer.value.byteLength;
      try {
        const response = await fetch(url, { method: "HEAD", signal });
        if (response.ok) {
          const value = Number(response.headers.get("content-length"));
          if (Number.isFinite(value) && value > 0) {
            size = value;
            return size;
          }
        }
      } catch {
        // fall through to a ranged/whole download
      }
      const bytes = await loadFull();
      return bytes.byteLength;
    },
    async read(offset, length) {
      if (signal?.aborted) throw new Error("Media processing aborted");
      if (fullBuffer.value) return readFull(offset, length);
      const cap = offset + length - 1;
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Range: `bytes=${offset}-${cap}` },
          signal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        return await loadFull().then((bytes) =>
          bytes.slice(offset, offset + length),
        );
      }
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (response.status === 200) {
          fullBuffer.value = bytes;
          size = bytes.byteLength;
        }
        return bytes;
      }
      return await loadFull().then((bytes) =>
        bytes.slice(offset, offset + length),
      );
    },
  };
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function toJsonSafeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) {
    if (value.byteLength > 1024 * 1024) return undefined;
    return Buffer.from(value).toString("base64");
  }
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

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toIsoDate(value: unknown): string | undefined {
  if (!hasValue(value)) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (hasValue(value)) return value;
  }
  return undefined;
}

function pickExtra(record: Record<string, unknown>, pattern: RegExp): unknown {
  for (const [key, value] of Object.entries(record)) {
    if (pattern.test(key) && hasValue(value)) return value;
  }
  return undefined;
}

function parseLocation(value: unknown): {
  latitude?: number;
  longitude?: number;
} {
  if (!hasValue(value)) return {};
  const text = String(value).trim();
  const degrees = text.match(
    /([+-]?\d+(?:\.\d+)?)\s*°\s*([NS])\s*,?\s*([+-]?\d+(?:\.\d+)?)\s*°\s*([EW])/i,
  );
  if (degrees) {
    const latitude =
      Number(degrees[1]) * (degrees[2].toUpperCase() === "S" ? -1 : 1);
    const longitude =
      Number(degrees[3]) * (degrees[4].toUpperCase() === "W" ? -1 : 1);
    return { latitude, longitude };
  }
  const signed = text.match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
  if (signed) {
    const latitude = Number(signed[1]);
    const longitude = Number(signed[2]);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { latitude, longitude };
    }
  }
  const plain = text.match(
    /([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)/,
  );
  if (plain) {
    const latitude = Number(plain[1]);
    const longitude = Number(plain[2]);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { latitude, longitude };
    }
  }
  return {};
}

function normalizeMediaInfoResult(
  result: MediaInfoResult,
): VideoMetadata | null {
  const tracks = result?.media?.track;
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  const general = (tracks.find((track) => track["@type"] === "General") ??
    tracks[0]) as unknown as Record<string, unknown>;
  const video = (tracks.find((track) => track["@type"] === "Video") ??
    {}) as unknown as Record<string, unknown>;
  if (!video["@type"] && !hasValue(general.Duration)) return null;
  const generalExtra =
    typeof general.extra === "object" && general.extra
      ? (general.extra as Record<string, unknown>)
      : {};
  const videoExtra =
    typeof video.extra === "object" && video.extra
      ? (video.extra as Record<string, unknown>)
      : {};

  const duration =
    toNumber(
      pick(general, ["Duration", "Duration_Start2End"]) ??
        pick(video, ["Duration"]),
    ) ?? undefined;
  const width =
    toNumber(pick(video, ["Width", "Sampled_Width", "Stored_Width"])) ??
    undefined;
  const height =
    toNumber(pick(video, ["Height", "Sampled_Height", "Stored_Height"])) ??
    undefined;

  const creationTime =
    toIsoDate(
      pick(general, ["Recorded_Date", "Encoded_Date", "Tagged_Date"]),
    ) ??
    toIsoDate(
      pickExtra(
        { ...generalExtra, ...videoExtra },
        /creationdate|creation_date|recorded_date|encoded_date|tagged_date|^date$/i,
      ),
    ) ??
    toIsoDate(pick(video, ["Recorded_Date", "Encoded_Date", "Tagged_Date"]));

  const make =
    (pick(general, [
      "Encoded_Hardware_CompanyName",
      "Encoded_Hardware_Vendor",
      "Make",
    ]) as string | undefined) ??
    (pickExtra({ ...generalExtra, ...videoExtra }, /make|manufactur/i) as
      | string
      | undefined) ??
    (pick(video, [
      "Encoded_Hardware_CompanyName",
      "Encoded_Hardware_Vendor",
      "Make",
    ]) as string | undefined);
  const model =
    (pick(general, [
      "Encoded_Hardware_Name",
      "Encoded_Hardware_String",
      "Model",
    ]) as string | undefined) ??
    (pickExtra({ ...generalExtra, ...videoExtra }, /^model$/i) as
      | string
      | undefined) ??
    (pick(video, ["Encoded_Hardware_Name", "Model"]) as string | undefined);

  const locationRaw =
    pick(general, ["Recorded_Location", "Location"]) ??
    pickExtra({ ...generalExtra, ...videoExtra }, /location|gps|iso6709/i);
  const { latitude, longitude } = parseLocation(locationRaw);

  const rotationRaw = pick(video, ["Rotation", "RotationZ"]);
  const rotation =
    typeof rotationRaw === "number" || typeof rotationRaw === "string"
      ? (toNumber(rotationRaw) ?? rotationRaw)
      : undefined;

  return {
    duration,
    width,
    height,
    creationTime,
    make,
    model,
    latitude: latitude ?? undefined,
    longitude: longitude ?? undefined,
    formatName: (pick(general, ["Format"]) as string | undefined) ?? undefined,
    formatLongName:
      (pick(general, ["Format_Commercial", "Format_Info"]) as
        | string
        | undefined) ?? undefined,
    bitrate:
      toNumber(pick(general, ["OverallBitRate"]) ?? pick(video, ["BitRate"])) ??
      undefined,
    codecName:
      (pick(video, ["CodecID", "Format"]) as string | undefined) ?? undefined,
    codecLongName:
      (pick(video, ["Format_Info", "Format_Commercial"]) as
        | string
        | undefined) ?? undefined,
    pixelFormat:
      (pick(video, ["ChromaSubsampling"]) as string | undefined) ?? undefined,
    rotation,
    frameRate: toNumber(pick(video, ["FrameRate", "FrameRate_Real"])),
    frameCount: toNumber(pick(video, ["FrameCount"])),
    formatTags: toJsonSafeValue({
      ...general,
      extra: generalExtra,
    }) as Record<string, unknown> | undefined,
    streamTags: toJsonSafeValue({
      ...video,
      extra: videoExtra,
    }) as Record<string, unknown> | undefined,
  };
}

async function analyzeMedia(
  source: ByteSource,
  signal: AbortSignal,
): Promise<VideoMetadata | null> {
  try {
    return await withImageProcessingSlot(async () => {
      try {
        const mediaInfo = await mediaInfoFactory({
          format: "object",
          full: true,
          coverData: false,
          chunkSize: ANALYZE_CHUNK_SIZE,
        });
        try {
          const result = await mediaInfo.analyzeData(
            () => source.size(),
            async (length, offset) => {
              if (signal.aborted) {
                throw new Error("Media processing aborted");
              }
              const chunk = await source.read(offset, length);
              if (signal.aborted) {
                throw new Error("Media processing aborted");
              }
              return chunk;
            },
          );
          if (!result?.media?.track?.length) return null;
          return normalizeMediaInfoResult(result);
        } finally {
          mediaInfo.close();
        }
      } finally {
        try {
          await source.close?.();
        } catch {}
      }
    }, signal);
  } catch (error) {
    if (signal.aborted) {
      logger.warn("Video metadata extraction aborted");
    } else {
      logger.error("Video metadata extraction failed:", error);
    }
    return null;
  }
}

async function extractFromSource(
  createSource: (signal: AbortSignal) => ByteSource,
  options: { timeoutMs?: number; signal?: AbortSignal },
): Promise<VideoMetadata | null> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? MEDIA_PROCESS_TIMEOUT_MS;
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onOuterAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await analyzeMedia(
      createSource(controller.signal),
      controller.signal,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}

export async function extractVideoMetadata(
  input: Buffer | string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<VideoMetadata | null> {
  return await extractFromSource(
    (signal) =>
      typeof input === "string"
        ? /^https?:\/\//i.test(input)
          ? urlSource(input, signal)
          : fileSource(input, signal)
        : memorySource(input),
    options,
  );
}

export async function extractVideoMetadataFromS3Key(
  s3Key: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<VideoMetadata | null> {
  return await extractFromSource((signal) => s3Source(s3Key, signal), options);
}
