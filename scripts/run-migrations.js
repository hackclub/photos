import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const client = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
});

try {
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
} finally {
  await client.end();
}
