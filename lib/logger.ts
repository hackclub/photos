import pino from "pino";

const redactPaths = [
  "req.headers.authorization",
  "request.headers.authorization",
  "headers.authorization",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "S3_SECRET_ACCESS_KEY",
  "S3_ACCESS_KEY_ID",
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "REDIS_URL",
  "NEXTAUTH_SECRET",
  "HACKCLUB_CLIENT_SECRET",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "CRON_SECRET",
];

const pinoLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service_name: process.env.OTEL_SERVICE_NAME ?? "hackclub-photos",
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

export const logger = {
  error: (...args: unknown[]) => write("error", args),
  warn: (...args: unknown[]) => write("warn", args),
  info: (...args: unknown[]) => write("info", args),
};

function write(level: "error" | "warn" | "info", args: unknown[]) {
  (pinoLogger[level] as (...a: unknown[]) => void)(...args);
}

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
