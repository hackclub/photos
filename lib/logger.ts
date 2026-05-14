import pino from "pino";
import { exportLogEntry } from "@/lib/logs-exporter";

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

const service = process.env.OTEL_SERVICE_NAME ?? "hackclub-photos";
const version = process.env.APP_VERSION;
const environment =
  process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";
const instanceId = process.env.HOSTNAME;

type LogLevel = "error" | "warn" | "info";

function write(level: LogLevel, args: unknown[]) {
  (pinoLogger[level] as (...args: unknown[]) => void)(...args);
  exportLogEntry(toLogEntry(level, args));
}

function toLogEntry(level: LogLevel, args: unknown[]) {
  const [first, second, ...rest] = args;
  const attributes: Record<string, unknown> = {};
  let message = "";
  let error: unknown;

  if (first && typeof first === "object" && !(first instanceof Error)) {
    Object.assign(attributes, first);
    message = typeof second === "string" ? second : String(second ?? "");
    if (second instanceof Error) error = second;
  } else {
    message = typeof first === "string" ? first : String(first ?? "");
    if (first instanceof Error) error = first;
    if (second instanceof Error) error = second;
    if (second !== undefined && !(second instanceof Error)) {
      attributes.detail = String(second);
    }
  }

  if (rest.length > 0) {
    attributes.extra = rest.map((item) =>
      item instanceof Error ? item.message : String(item),
    );
  }

  if (error instanceof Error) {
    attributes["error.name"] = error.name;
    attributes["error.message"] = error.message;
    attributes["error.stack"] = error.stack;
  }

  return { level, message, attributes, error };
}

export const logger = {
  error: (...args: unknown[]) => write("error", args),
  warn: (...args: unknown[]) => write("warn", args),
  info: (...args: unknown[]) => write("info", args),
};

logger.info(
  { service, version, environment, instanceId },
  "application started",
);

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
