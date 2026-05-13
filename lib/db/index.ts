import { context, SpanStatusCode, trace } from "@opentelemetry/api";
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
        "db.statement": query,
        "db.operation.parameter_count": parameters.length,
      });
    },
  });

  const originalUnsafe = sql.unsafe.bind(sql);
  sql.unsafe = ((query, parameters, options) => {
    const tracer = trace.getTracer("hackclub-photos-db");
    return tracer.startActiveSpan(
      "postgres.query",
      {
        attributes: {
          "db.system": "postgresql",
          "db.statement": query,
          "db.operation.parameter_count": parameters?.length ?? 0,
        },
      },
      async (span) => {
        try {
          const result = await context.with(
            trace.setSpan(context.active(), span),
            () => originalUnsafe(query, parameters, options),
          );
          return result;
        } catch (error) {
          if (error instanceof Error) {
            span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
          } else {
            span.recordException(String(error));
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: String(error),
            });
          }
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }) as typeof sql.unsafe;

  return sql;
}

export const client = globalQueryClient.queryClient || createQueryClient();
if (process.env.NODE_ENV !== "production") {
  globalQueryClient.queryClient = client;
}
export const db = drizzle(client, { schema });
