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

You'll need Node 20+, a Postgres DB, and an S3 bucket, KV (Redis) Is Optional for Ratelimits.

1.  **Get the code**
    ```bash
    git clone https://github.com/hackclub/photos.git
    cd photos
    npm install
    ```

2.  **Set up env**
    ```bash
    cp .env.example .env
    # Fill in your creds!
    ```

3.  **Push schema**
    ```bash
    npm run db:push
    ```

4.  **Run dev** 
    ```bash
    npm run dev
    ```

## License

MIT

---

Made with ❤️ by [Hack Clubbers](https://hackclub.com) from all around the world.
