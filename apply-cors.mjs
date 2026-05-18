import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import fs from "fs";

let accessKey = "";
let secretKey = "";
let endpoint = "";
let bucket = "";

const envContent = fs.readFileSync(".env", "utf8");
for (const line of envContent.split("\n")) {
  if (line.startsWith("S3_ACCESS_KEY_ID=")) {
    accessKey = line.split("=")[1].replace(/"/g, "").trim();
  }
  if (line.startsWith("S3_SECRET_ACCESS_KEY=")) {
    secretKey = line.split("=")[1].replace(/"/g, "").trim();
  }
  if (line.startsWith("S3_ENDPOINT=")) {
    endpoint = line.split("=")[1].replace(/"/g, "").trim();
  }
  if (line.startsWith("S3_BUCKET_NAME=")) {
    bucket = line.split("=")[1].replace(/"/g, "").trim();
  }
}

const client = new S3Client({
  region: "auto",
  endpoint: endpoint,
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
  },
});

const command = new PutBucketCorsCommand({
  Bucket: bucket,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET", "PUT", "POST", "HEAD"],
        AllowedOrigins: ["https://photos.hackclub.com"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 86400,
      },
    ],
  },
});

async function run() {
  try {
    await client.send(command);
    console.log(
      `✅ CORS policy strictly applied to https://photos.hackclub.com on bucket ${bucket}`,
    );
  } catch (error) {
    console.error("❌ Failed to apply CORS:", error);
  }
}

run();
