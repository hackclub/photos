import { GetObjectCommand } from "@aws-sdk/client-s3";
import decode from "heic-decode";
import sharp from "sharp";
import { s3Client } from "@/lib/media/s3";
export async function convertHeicToJpeg(s3Key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: s3Key,
  });
  const s3Response = await s3Client.send(command);
  if (!s3Response.Body) {
    console.error(`[HEIC Conversion] S3 Body empty for ${s3Key}`);
    throw new Error("File not found in storage");
  }
  const inputBuffer = await s3Response.Body.transformToByteArray();
  const convertPromise = async () => {
    try {
      return await sharp(inputBuffer)
        .resize({
          width: 2500,
          height: 2500,
          fit: "inside",
          withoutEnlargement: true,
        })
        .toFormat("jpeg", { quality: 80, mozjpeg: false })
        .toBuffer();
    } catch (_sharpError) {
      try {
        let decoder: any = decode;
        if (
          typeof decoder !== "function" &&
          typeof decoder?.default === "function"
        ) {
          decoder = decoder.default;
        }
        const buffer = Buffer.from(inputBuffer);
        const { width, height, data } = await decoder({
          buffer: buffer,
        });
        return await sharp(Buffer.from(data), {
          raw: { width, height, channels: 4 },
        })
          .resize({
            width: 2500,
            height: 2500,
            fit: "inside",
            withoutEnlargement: true,
          })
          .toFormat("jpeg", { quality: 80, mozjpeg: false })
          .toBuffer();
      } catch (decodeError) {
        console.error("[HEIC Conversion] heic-decode failed:", decodeError);
        throw decodeError;
      }
    }
  };
  const timeoutPromise = new Promise<Buffer>((_, reject) =>
    setTimeout(
      () => reject(new Error("Conversion timed out after 30s")),
      30000,
    ),
  );
  const outputBuffer = await Promise.race([convertPromise(), timeoutPromise]);
  return outputBuffer;
}
