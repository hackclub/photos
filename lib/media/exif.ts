import exifr from "exifr";
export interface ExifData {
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
  orientation?: number;
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
        tiff: isTiff,
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
      make: exif.Make,
      model: exif.Model,
      lensModel: exif.LensModel,
      focalLength: exif.FocalLength,
      fNumber: exif.FNumber,
      iso: exif.ISO,
      exposureTime: exif.ExposureTime,
      flash: exif.Flash !== undefined ? exif.Flash > 0 : undefined,
      dateTimeOriginal: exif.DateTimeOriginal?.toISOString(),
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
      console.warn(
        `EXIF extraction skipped (Unknown Format)${contextInfo ? ` for ${contextInfo}` : ""}`,
      );
    } else {
      console.error(
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
