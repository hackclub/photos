import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const client = postgres(process.env.DATABASE_URL, {
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
