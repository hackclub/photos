import exifr from "exifr";
import { logger } from "@/lib/logger";
export interface ExifData {
  [key: string]: unknown;
  make?: string;
  model?: string;
  lensModel?: string;
  focalLength?: number;
  fNumber?: number;
  iso?: number;
  exposureTime?: number;
  flash?: boolean;
  dateTimeOriginal?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  width?: number;
  height?: number;
  orientation?: number | string;
}

function toIsoDate(value: unknown) {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  return undefined;
}

function toJsonSafeExifValue(value: unknown): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => toJsonSafeExifValue(item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const safeObject: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const safeValue = toJsonSafeExifValue(nestedValue);
      if (safeValue !== undefined) safeObject[key] = safeValue;
    }
    return Object.keys(safeObject).length > 0 ? safeObject : undefined;
  }
  return value;
}

function toJsonSafeExif(exif: Record<string, unknown>) {
  const safeExif: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(exif)) {
    if (key === "Thumbnail" || key === "Screenshot") continue;
    const safeValue = toJsonSafeExifValue(value);
    if (safeValue !== undefined) safeExif[key] = safeValue;
  }
  return safeExif;
}

export async function extractExifData(
  buffer: Buffer,
  contextInfo?: string,
): Promise<ExifData | null> {
  try {
    let bufferToParse = buffer;
    if (
      buffer.length > 6 &&
      buffer.toString("ascii", 0, 4) === "Exif" &&
      buffer[4] === 0 &&
      buffer[5] === 0
    ) {
      bufferToParse = buffer.subarray(6);
    }
    const attemptParse = async (buf: Buffer) => {
      const isTiff =
        buf.length > 2 &&
        ((buf[0] === 0x49 && buf[1] === 0x49) ||
          (buf[0] === 0x4d && buf[1] === 0x4d));
      return await exifr.parse(buf, {
        gps: true,
        mergeOutput: true,
        xmp: true,
        iptc: true,
        ...(isTiff ? { tiff: true } : {}),
      });
    };
    let exif = null;
    try {
      exif = await attemptParse(bufferToParse);
    } catch (err) {
      if (bufferToParse !== buffer) {
        try {
          exif = await attemptParse(buffer);
        } catch (_retryErr) {
          throw err;
        }
      } else {
        throw err;
      }
    }
    if (!exif) return null;
    let gpsLatitude: number | undefined = exif.latitude;
    let gpsLongitude: number | undefined = exif.longitude;
    if (
      gpsLatitude === undefined &&
      exif.GPSLatitude &&
      Array.isArray(exif.GPSLatitude)
    ) {
      const lat = exif.GPSLatitude;
      let latValue = lat[0] + lat[1] / 60 + lat[2] / 3600;
      if (exif.GPSLatitudeRef === "S") {
        latValue = -latValue;
      }
      gpsLatitude = latValue;
    }
    if (
      gpsLongitude === undefined &&
      exif.GPSLongitude &&
      Array.isArray(exif.GPSLongitude)
    ) {
      const lon = exif.GPSLongitude;
      let lonValue = lon[0] + lon[1] / 60 + lon[2] / 3600;
      if (exif.GPSLongitudeRef === "W") {
        lonValue = -lonValue;
      }
      gpsLongitude = lonValue;
    }
    return {
      ...toJsonSafeExif(exif as Record<string, unknown>),
      make: exif.Make,
      model: exif.Model,
      lensModel: exif.LensModel,
      focalLength: exif.FocalLength,
      fNumber: exif.FNumber,
      iso: exif.ISO,
      exposureTime: exif.ExposureTime,
      flash: exif.Flash !== undefined ? exif.Flash > 0 : undefined,
      dateTimeOriginal:
        toIsoDate(exif.DateTimeOriginal) ||
        toIsoDate(exif.CreateDate) ||
        toIsoDate(exif.ModifyDate),
      gpsLatitude,
      gpsLongitude,
      width: exif.ImageWidth || exif.ExifImageWidth,
      height: exif.ImageHeight || exif.ExifImageHeight,
      orientation: exif.Orientation,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unknown file format")
    ) {
      logger.warn(
        `EXIF extraction skipped (Unknown Format)${contextInfo ? ` for ${contextInfo}` : ""}`,
      );
    } else {
      logger.error(
        `Error extracting EXIF data${contextInfo ? ` for ${contextInfo}` : ""}:`,
        error,
      );
    }
    return null;
  }
}
export function formatExposureTime(exposureTime?: number): string {
  if (!exposureTime) return "N/A";
  if (exposureTime >= 1) return `${exposureTime.toFixed(1)}s`;
  return `1/${Math.round(1 / exposureTime)}s`;
}
export function formatFocalLength(focalLength?: number): string {
  if (!focalLength) return "N/A";
  return `${Math.round(focalLength)}mm`;
}
export function formatAperture(fNumber?: number): string {
  if (!fNumber) return "N/A";
  return `f/${fNumber.toFixed(1)}`;
}
export function formatISO(iso?: number): string {
  if (!iso) return "N/A";
  return `ISO ${iso}`;
}
