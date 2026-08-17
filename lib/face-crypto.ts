import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function encryptionKey() {
  const secret = process.env.FACE_DATA_ENCRYPTION_KEY;
  if (!secret) throw new Error("FACE_DATA_ENCRYPTION_KEY is not configured");
  if (secret.length < 32) {
    throw new Error("FACE_DATA_ENCRYPTION_KEY must be at least 32 characters");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptFaceTemplate(template: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(template, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptFaceTemplate(encrypted: string): string {
  const [version, iv, tag, ciphertext] = encrypted.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) {
    throw new Error("Invalid encrypted face template");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
