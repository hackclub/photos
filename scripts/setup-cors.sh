#!/bin/bash

# Configuration for secure Cloudflare R2 CORS settings
# Used to enable direct browser uploads (Presigned URLs)

echo '{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "https://photos.hackclub.com",
        "http://localhost:3000"
      ],
      "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 86400
    }
  ]
}' > cors-config.json

echo "CORS config created. 🚀"
echo ""
echo "Run this command to apply it (Replacing placeholders with your R2 details):"
echo "aws s3api put-bucket-cors \\"
echo "  --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com \\"
echo "  --bucket <BUCKET_NAME> \\"
echo "  --cors-configuration file://cors-config.json"
echo ""
echo "Or using Cloudflare's Wrangler:"
echo "wrangler r2 bucket cors set <BUCKET_NAME> cors-config.json"