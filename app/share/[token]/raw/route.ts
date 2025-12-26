import {
  GetObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { type NextRequest, NextResponse } from "next/server";
import { getSharedMedia } from "@/app/actions/sharing";
import { convertHeicToJpeg } from "@/lib/media/heic";
import { s3Client } from "@/lib/media/s3";
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      token: string;
    }>;
  },
) {
  const { token } = await params;
  const searchParams = request.nextUrl.searchParams;
  const variant = searchParams.get("variant");
  const result = await getSharedMedia(token);
  if (!result.success || !result.link || !result.link.media) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const { media } = result.link;
  try {
    const key = media.s3Key;
    if (
      (media.mimeType === "image/heic" || media.mimeType === "image/heif") &&
      variant === "display"
    ) {
      try {
        const outputBuffer = await convertHeicToJpeg(key);
        return new Response(new Uint8Array(outputBuffer), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      } catch (e) {
        console.error("[HEIC Conversion] Error converting HEIC:", e);
        return new NextResponse(
          `Image processing failed: ${e instanceof Error ? e.message : String(e)}`,
          { status: 500 },
        );
      }
    }
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    });
    let s3Response: GetObjectCommandOutput;
    try {
      s3Response = await s3Client.send(command);
    } catch (error) {
      console.error(`Failed to fetch from S3:`, error);
      return new NextResponse("Failed to fetch media", { status: 502 });
    }
    const headers = new Headers();
    headers.set("Content-Type", s3Response.ContentType || media.mimeType);
    if (s3Response.ContentLength) {
      headers.set("Content-Length", String(s3Response.ContentLength));
    }
    headers.set("Cache-Control", "public, max-age=3600, s-maxage=31536000");
    headers.set("Content-Disposition", `inline; filename="${media.filename}"`);
    return new NextResponse(s3Response.Body as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Error generating download URL:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
