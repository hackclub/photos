import { trace } from "@opentelemetry/api";
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

function createQueryClient() {
  const sql = postgres(connectionString, {
    prepare: false,
    debug: (_connection, query, parameters) => {
      const span = trace.getActiveSpan();
      if (!span) return;

      span.addEvent("db.query", {
        "db.system": "postgresql",
        "db.operation.parameter_count": parameters.length,
        "db.statement.length": query.length,
      });
    },
  });

  const originalUnsafe = sql.unsafe.bind(sql);
  sql.unsafe = ((query, parameters, options) => {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent("db.query.unsafe", {
        "db.system": "postgresql",
        "db.operation.parameter_count": parameters?.length ?? 0,
        "db.statement.length": query.length,
      });
    }

    return originalUnsafe(query, parameters, options);
  }) as typeof sql.unsafe;

  return sql;
}

export const client = globalQueryClient.queryClient || createQueryClient();
if (process.env.NODE_ENV !== "production") {
  globalQueryClient.queryClient = client;
}
export const db = drizzle(client, { schema });
