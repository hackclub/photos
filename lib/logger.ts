import pino from "pino";

const redactPaths = [
  "req.headers.authorization",
  "request.headers.authorization",
  "headers.authorization",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "S3_SECRET_ACCESS_KEY",
  "S3_ACCESS_KEY_ID",
  "DATABASE_URL",
];

const pinoLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: process.env.OTEL_SERVICE_NAME ?? "hackclub-photos",
    environment: process.env.NODE_ENV,
  },
  redact: {
    paths: redactPaths,
    censor: "[redacted]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

type LogLevel = "error" | "warn" | "info";

function write(level: LogLevel, args: unknown[]) {
  (pinoLogger[level] as (...args: unknown[]) => void)(...args);
}

export const logger = {
  error: (...args: unknown[]) => write("error", args),
  warn: (...args: unknown[]) => write("warn", args),
  info: (...args: unknown[]) => write("info", args),
};

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    };
  }

  return { message: String(error) };
}

export async function recordException(error: unknown) {
  if (typeof window !== "undefined") return;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;

  const { trace, SpanStatusCode } = await import("@opentelemetry/api");
  const span = trace.getActiveSpan();
  if (!span) return;

  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    return;
  }

  span.recordException(String(error));
  span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
}
