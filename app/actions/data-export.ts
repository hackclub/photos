"use server";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { and, eq, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import * as yazl from "yazl";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dataExports, users } from "@/lib/db/schema";
import { deleteFromS3, uploadToS3 } from "@/lib/media/s3";
import { getUserContext } from "@/lib/policy";
export async function requestDataExport() {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    const recentExport = await db.query.dataExports.findFirst({
      where: and(
        eq(dataExports.userId, user.id),
        eq(dataExports.status, "completed"),
        gt(
          dataExports.createdAt,
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        ),
      ),
    });
    if (recentExport) {
      return {
        success: false,
        error: "You can only export your data once per week.",
      };
    }
    const existingExports = await db.query.dataExports.findMany({
      where: eq(dataExports.userId, user.id),
    });
    for (const exp of existingExports) {
      if (exp.status === "pending" || exp.status === "processing") {
        return {
          success: false,
          error: "You already have an export in progress.",
        };
      }
      if (exp.s3Key) {
        try {
          await deleteFromS3(exp.s3Key);
        } catch (e) {
          console.error(`Failed to delete old export S3 key ${exp.s3Key}:`, e);
        }
      }
      await db.delete(dataExports).where(eq(dataExports.id, exp.id));
    }
    const [newExport] = await db
      .insert(dataExports)
      .values({
        userId: user.id,
        status: "pending",
      })
      .returning();
    await auditLog(user.id, "create", "data_export", newExport.id, {
      status: "pending",
    });
    after(async () => {
      await processDataExport(newExport.id, user.id);
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Error requesting data export:", error);
    return { success: false, error: "Failed to request data export" };
  }
}
async function processDataExport(exportId: string, userId: string) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await db
      .update(dataExports)
      .set({ status: "processing" })
      .where(eq(dataExports.id, exportId));
    const userData = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        createdSeries: true,
        createdEvents: true,
        uploadedMedia: true,
        eventParticipations: {
          with: {
            event: true,
          },
        },
        mediaLikes: {
          with: {
            media: true,
          },
        },
        mediaComments: {
          with: {
            media: true,
          },
        },
        mentions: {
          with: {
            media: true,
          },
        },
        apiKeys: true,
      },
    });
    if (!userData) {
      throw new Error("User not found");
    }
    const safeUserData = {
      ...userData,
      hcaAccessToken: undefined,
      apiKeys: userData.apiKeys.map((key) => ({
        ...key,
        key: `${key.key.substring(0, 8)}...`,
      })),
    };
    const downloadId = randomBytes(16).toString("hex");
    const tempPath = join(tmpdir(), `data-export-${downloadId}.zip`);
    const zipFile = new yazl.ZipFile();
    const output = createWriteStream(tempPath);
    zipFile.outputStream.pipe(output);
    const jsonContent = JSON.stringify(safeUserData, null, 2);
    zipFile.addReadStream(Readable.from(jsonContent), "user-data.json", {
      mode: 0o644,
      size: Buffer.byteLength(jsonContent),
    });
    const mediaItems = userData.uploadedMedia || [];
    for (const [index, item] of mediaItems.entries()) {
      if (index % 5 === 0) {
        const currentExport = await db.query.dataExports.findFirst({
          where: eq(dataExports.id, exportId),
          columns: { status: true },
        });
        if (currentExport?.status === "cancelled") {
          output.destroy();
          await unlink(tempPath).catch(() => {});
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { s3Client } = await import("@/lib/media/s3");
        const command = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: item.s3Url,
        });
        const response = await s3Client.send(command);
        if (response.Body) {
          const folder = item.mimeType.startsWith("image/")
            ? "photos"
            : "videos";
          const zipPath = `media/${folder}/${item.filename}`;
          const stream = response.Body as Readable;
          zipFile.addReadStream(stream, zipPath, {
            mtime: item.uploadedAt,
            mode: 0o644,
            size: Number(item.fileSize),
            forceZip64Format: true,
          });
        }
      } catch (err) {
        console.error(`Failed to add media ${item.id} to export:`, err);
      }
    }
    if (userData.avatarS3Key) {
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { s3Client } = await import("@/lib/media/s3");
        const command = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: userData.avatarS3Key,
        });
        const response = await s3Client.send(command);
        if (response.Body) {
          const stream = response.Body as Readable;
          zipFile.addReadStream(stream, "avatar.jpg", {
            mode: 0o644,
          });
        }
      } catch (err) {
        console.error("Failed to add avatar to export:", err);
      }
    }
    zipFile.end();
    await new Promise<void>((resolve, reject) => {
      output.on("finish", () => resolve());
      output.on("error", reject);
    });
    const s3Key = `exports/${exportId}/archive.zip`;
    const fileStream = createReadStream(tempPath);
    await uploadToS3(fileStream, s3Key, "application/zip");
    try {
      await db
        .update(dataExports)
        .set({
          status: "completed",
          s3Key: s3Key,
          completedAt: new Date(),
        })
        .where(eq(dataExports.id, exportId));
    } catch (dbError) {
      console.error("Failed to update export record after upload:", dbError);
      try {
        await deleteFromS3(s3Key);
      } catch (s3Error) {
        console.error("Failed to cleanup orphaned export file:", s3Error);
      }
      throw dbError;
    }
    await unlink(tempPath).catch(console.error);
  } catch (error) {
    console.error("Data export failed:", error);
    const currentExport = await db.query.dataExports.findFirst({
      where: eq(dataExports.id, exportId),
      columns: { status: true },
    });
    if (currentExport?.status !== "cancelled") {
      await db
        .update(dataExports)
        .set({ status: "failed" })
        .where(eq(dataExports.id, exportId));
    }
  }
}
export async function cancelDataExport(exportId: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    const exportRecord = await db.query.dataExports.findFirst({
      where: eq(dataExports.id, exportId),
    });
    if (!exportRecord) {
      return { success: false, error: "Export not found" };
    }
    if (exportRecord.userId !== user.id) {
      return { success: false, error: "Forbidden" };
    }
    if (
      exportRecord.status !== "pending" &&
      exportRecord.status !== "processing"
    ) {
      return { success: false, error: "Export cannot be cancelled" };
    }
    await db
      .update(dataExports)
      .set({ status: "cancelled" })
      .where(eq(dataExports.id, exportId));
    await auditLog(user.id, "update", "data_export", exportId, {
      status: "cancelled",
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Error cancelling export:", error);
    return { success: false, error: "Failed to cancel export" };
  }
}
export async function getLatestExport() {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    const latestExport = await db.query.dataExports.findFirst({
      where: eq(dataExports.userId, user.id),
      orderBy: (exports, { desc }) => [desc(exports.createdAt)],
    });
    if (!latestExport) {
      return { success: true, export: null };
    }
    let downloadUrl = null;
    if (latestExport.status === "completed" && latestExport.s3Key) {
      downloadUrl = `/api/data-export/download/${latestExport.id}`;
    }
    return {
      success: true,
      export: {
        ...latestExport,
        downloadUrl,
      },
    };
  } catch (error) {
    console.error("Error getting latest export:", error);
    return { success: false, error: "Failed to get export status" };
  }
}
export async function deleteExport(exportId: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    const exportRecord = await db.query.dataExports.findFirst({
      where: eq(dataExports.id, exportId),
    });
    if (!exportRecord) {
      return { success: false, error: "Export not found" };
    }
    if (exportRecord.userId !== user.id) {
      return { success: false, error: "Forbidden" };
    }
    if (exportRecord.s3Key) {
      try {
        await deleteFromS3(exportRecord.s3Key);
      } catch (e) {
        console.error(
          `Failed to delete export S3 key ${exportRecord.s3Key}:`,
          e,
        );
      }
    }
    await db.delete(dataExports).where(eq(dataExports.id, exportId));
    await auditLog(user.id, "delete", "data_export", exportId, {
      s3Key: exportRecord.s3Key,
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Error deleting export:", error);
    return { success: false, error: "Failed to delete export" };
  }
}
