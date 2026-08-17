import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";

if (!process.env.DATABASE_URL && !isNextBuild) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const connectionString =
  process.env.DATABASE_URL ??
  "postgres://build:build@127.0.0.1:5432/build_placeholder";
const globalQueryClient = global as unknown as {
  queryClient?: postgres.Sql;
};

function createQueryClient() {
  const isVercelRuntime = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
  const configuredMaxConnections = Number(process.env.DATABASE_MAX_CONNECTIONS);
  const max = isVercelRuntime
    ? Number.isFinite(configuredMaxConnections)
      ? Math.max(1, Math.min(40, Math.floor(configuredMaxConnections)))
      : 40
    : Number.isFinite(configuredMaxConnections)
      ? Math.max(1, Math.min(20, Math.floor(configuredMaxConnections)))
      : 5;
  return postgres(connectionString, {
    max,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 30,
    max_lifetime: 30 * 60,
    connection: {
      statement_timeout: 120_000,
      idle_in_transaction_session_timeout: 60_000,
    },
  });
}

export const client = globalQueryClient.queryClient || createQueryClient();
globalQueryClient.queryClient = client;
export const db = drizzle(client, { schema });
