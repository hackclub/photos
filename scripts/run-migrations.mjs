import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const migrationUrl =
  process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    "MIGRATION_DATABASE_URL or DATABASE_URL is required to run migrations",
  );
}

const client = postgres(migrationUrl, {
  max: 1,
  prepare: false,
});
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const migrationLock = [2147483647, 2147483646];

try {
  await client`SELECT pg_advisory_lock(${migrationLock[0]}, ${migrationLock[1]})`;
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
} finally {
  await client`
    SELECT pg_advisory_unlock(${migrationLock[0]}, ${migrationLock[1]})
  `.catch(() => {});
  await client.end();
}
