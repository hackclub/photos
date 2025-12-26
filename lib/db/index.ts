import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const connectionString = process.env.DATABASE_URL;
const globalQueryClient = global as unknown as {
  queryClient: postgres.Sql;
};
export const client =
  globalQueryClient.queryClient ||
  postgres(connectionString, { prepare: false });
if (process.env.NODE_ENV !== "production") {
  globalQueryClient.queryClient = client;
}
export const db = drizzle(client, { schema });
