import { Readable } from "node:stream";
import ffmpeg from "fluent-ffmpeg";
export interface VideoMetadata {
  duration?: number;
  width?: number;
  height?: number;
  creationTime?: string;
  make?: string;
  model?: string;
  latitude?: number;
  longitude?: number;
}
export async function extractVideoMetadata(
  input: Buffer | string,
): Promise<VideoMetadata | null> {
  return new Promise((resolve) => {
    try {
      let stream: Readable | string;
      if (Buffer.isBuffer(input)) {
        stream = Readable.from(input);
      } else {
        stream = input;
      }
      ffmpeg(stream).ffprobe((err, metadata) => {
        if (err) {
          console.error("FFprobe error:", err);
          resolve(null);
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
        resolve({
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
        });
      });
    } catch (error) {
      console.error("Video metadata extraction error:", error);
      resolve(null);
    }
  });
}
