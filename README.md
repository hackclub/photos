![Hack Club Photos Banner](https://hc-cdn.hel1.your-objectstorage.com/s/v3/a54592b546a360f0_cleanshot_2025-12-16_at_00.20.34.png)

# Hack Club Photos

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.44-green?style=for-the-badge&logo=drizzle)](https://orm.drizzle.team/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)

No more digging for Google Photos Links, photos.hackclub.com stores photos in original quality, forever!

## How it works

*   **Storage**: We use S3-compatible storage (AWS, R2, MinIO, etc) in prod we use Hetzner!
*   **Database**: Postgres with Drizzle ORM
*   **Auth**: Hack Club OAuth

## Running it for Dev

You'll need Node 24+, Bun, a Postgres DB, and an S3 bucket. Redis is required for distributed rate limits and the vision queue in production.

1.  **Get the code**
    ```bash
    git clone https://github.com/hackclub/photos.git
    cd photos
     bun install
    ```

2.  **Set up env**
    ```bash
    cp .env.example .env
    # Fill in your creds!
    ```

3.  **Run migrations**
     ```bash
     bun run db:migrate
     ```

4.  **Run dev**
     ```bash
     bun run dev
     ```

Face indexing runs as a separate Node service in `services/vision-worker`.
Install its dependencies and run it with `bun run vision:dev`. The service
automatically uses the bundled macOS arm64 ROC SDK locally and the Linux x64 SDK
in its production Docker image.

Desktop face enrollment offers a short-lived QR handoff to `/face-capture/*`.
The phone does not need a login: Redis stores an unguessable, single-use session
for ten minutes, while camera frames are sent only for transient liveness
processing and are never persisted.

Production deploys should run `bun run db:migrate` as a release step before serving the new application version. The Vercel production build performs that release step automatically; local and non-production builds remain database-free unless explicitly requested.

## Deploying on Vercel

This repository is configured for Vercel in `vercel.json`:

- Framework: Next.js
- Install command: `bun install --frozen-lockfile`
- Build command: `bun run vercel:build`
- Cron: `/api/cron/slack-notifications` every minute
- Runtime: Node.js 24.x with Fluid Compute in Frankfurt (`fra1`)

### 1. Create the Vercel project

Import the GitHub repository into Vercel with the repository root as the project root. Do not configure Docker or an output directory. Vercel should use the committed `vercel.json` settings.

Set the project Node.js version to `24.x` if it is not detected from `package.json`. Keep Preview and Production as separate Vercel environments.

### 2. Connect external services

The application runs on Vercel, but its stateful services remain external:

- Postgres: use a pooled connection for `DATABASE_URL` and a direct connection for `MIGRATION_DATABASE_URL` when available. Each function instance pools up to `DATABASE_MAX_CONNECTIONS` (default 40) through the pooler.
- Redis: set `REDIS_URL`. Production uses Redis for distributed rate limits, multipart-upload state, and short-lived phone capture handoffs.
- S3-compatible storage: set the S3 variables below and configure bucket CORS for the production domain and any preview domains that need browser uploads.
- Vision worker: deploy `services/vision-worker/Dockerfile` on Linux x64 and keep its HTTP endpoint private.

For Postgres, set `DATABASE_URL` and `MIGRATION_DATABASE_URL` in Production. For Preview, use a separate database or provider branch and set `MIGRATE_PREVIEW_DATABASE=true`; never point preview migrations at the production database.

`DATABASE_URL` must be the provider's pooled/serverless URL. Do not use the direct database URL for runtime traffic on Vercel. Keep the direct URL in `MIGRATION_DATABASE_URL` for the migration step only.

### 3. Configure environment variables

Add the variables from `.env.example` to the matching Vercel environments. At minimum, Production needs:

```text
DATABASE_URL
MIGRATION_DATABASE_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
HACKCLUB_CLIENT_ID
HACKCLUB_CLIENT_SECRET
S3_ENDPOINT
S3_REGION
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_BUCKET_NAME
REDIS_URL
CRON_SECRET
NEXT_PUBLIC_APP_URL
SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET
SLACK_PHOTOS_FEED_CHANNEL_ID
FLAGS
FLAGS_SECRET
VISION_WORKER_URL
VISION_WORKER_TOKEN
VISION_DATA_ENCRYPTION_KEY
FACE_DATA_ENCRYPTION_KEY
```

Create these Vercel Flags with the exact keys `maintenance-mode`, `signage`, and `coming-soon`. Vercel supplies `FLAGS` and `FLAGS_SECRET` when Flags are enabled for the project. The repository includes the Flags Explorer discovery endpoint at `/.well-known/vercel/flags`.

Set `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to the canonical HTTPS domain, for example `https://photos.hackclub.com`. Register this OAuth callback with Hack Club:

```text
https://photos.hackclub.com/api/auth/callback
```

Vercel automatically sends `CRON_SECRET` as the `Authorization: Bearer ...` header for the configured Cron request. The Cron route also remains manually callable with that header.

### 4. Deploy and migrate

Production deployments run `bun run db:migrate` before `bun run build`. The migration script takes a Postgres advisory lock, so concurrent production builds do not run migrations simultaneously. If migration fails, the deployment fails instead of serving the new application version.

Preview deployments skip migrations by default. Enable `MIGRATE_PREVIEW_DATABASE=true` only when the Preview environment has its own database.

Generate and commit migrations locally with `bun run db:generate`; do not use `drizzle-kit push` against Production.

### 5. Configure the domain and Cron

Add the production domain in Vercel, then redeploy after changing `NEXTAUTH_URL` or `NEXT_PUBLIC_APP_URL`. Vercel Cron uses UTC and only schedules the production deployment. Storage repairs are intentionally manual and are not registered as Cron jobs.

The direct API upload endpoint is capped at 4 MB because Vercel rejects larger request bodies before application code runs. The web uploader uses presigned S3 and multipart uploads for larger media.

## License

MIT

---

Made with ❤️ by [Hack Clubbers](https://hackclub.com) from all around the world.
