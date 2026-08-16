import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const connectionString = process.env.DATABASE_URL;
const globalQueryClient = global as unknown as {
  queryClient?: postgres.Sql;
};

function createQueryClient() {
  const configuredMaxConnections = Number(process.env.DATABASE_MAX_CONNECTIONS);
  const max = Number.isFinite(configuredMaxConnections)
    ? Math.max(2, Math.min(20, Math.floor(configuredMaxConnections)))
    : 10;
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
