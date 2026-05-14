import { context, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

type LogLevel = "error" | "warn" | "info";

export interface OtelLogEntry {
  level: LogLevel;
  message: string;
  attributes?: Record<string, unknown>;
  error?: unknown;
}

let loggerProvider: LoggerProvider | null = null;
let initialized = false;

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const safeEndpoint = endpoint?.startsWith("https://in-sig.deployor.dev")
  ? endpoint
  : undefined;

function buildResourceAttributes() {
  const envAttributes = Object.fromEntries(
    (process.env.OTEL_RESOURCE_ATTRIBUTES ?? "")
      .split(",")
      .flatMap((attribute) => {
        const separator = attribute.indexOf("=");
        if (separator === -1) return [];

        return [
          [
            attribute.slice(0, separator).trim(),
            attribute.slice(separator + 1).trim(),
          ],
        ];
      }),
  );

  const environment =
    process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";

  return {
    ...envAttributes,
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "hackclub-photos",
    [ATTR_SERVICE_NAMESPACE]: envAttributes[ATTR_SERVICE_NAMESPACE] ?? "photos",
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]:
      envAttributes[ATTR_DEPLOYMENT_ENVIRONMENT_NAME] ?? environment,
    ...(process.env.APP_VERSION
      ? { [ATTR_SERVICE_VERSION]: process.env.APP_VERSION }
      : {}),
    ...(process.env.HOSTNAME
      ? { [ATTR_SERVICE_INSTANCE_ID]: process.env.HOSTNAME }
      : {}),
  };
}

function logsUrl() {
  if (!safeEndpoint) return undefined;
  if (safeEndpoint.endsWith("/v1/logs")) return safeEndpoint;
  return `${safeEndpoint.replace(/\/$/, "")}/v1/logs`;
}

function parseHeaders() {
  const rawHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  if (!rawHeaders) return undefined;

  return Object.fromEntries(
    rawHeaders.split(",").flatMap((header) => {
      const separator = header.indexOf("=");
      if (separator === -1) return [];

      return [
        [
          decodeURIComponent(header.slice(0, separator).trim()),
          decodeURIComponent(header.slice(separator + 1).trim()),
        ],
      ];
    }),
  );
}

function severityNumber(level: LogLevel) {
  switch (level) {
    case "error":
      return SeverityNumber.ERROR;
    case "warn":
      return SeverityNumber.WARN;
    case "info":
      return SeverityNumber.INFO;
  }
}

function sanitizeAttributeValue(value: unknown): string | number | boolean {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}

function sanitizeAttributes(attributes: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([key]) => {
        const normalized = key.toLowerCase();
        return !(
          normalized.includes("authorization") ||
          normalized.includes("cookie") ||
          normalized.includes("token") ||
          normalized.includes("secret") ||
          normalized.includes("password") ||
          normalized.includes("signedurl") ||
          normalized.includes("signed_url")
        );
      })
      .map(([key, value]) => [key, sanitizeAttributeValue(value)]),
  );
}

export function initializeLogsExporter() {
  if (typeof window !== "undefined" || initialized || !safeEndpoint) {
    return;
  }

  loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes(buildResourceAttributes()),
    processors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: logsUrl(),
          headers: parseHeaders(),
        }),
        {
          maxQueueSize: 1000,
          maxExportBatchSize: 64,
          scheduledDelayMillis: 5000,
          exportTimeoutMillis: 30000,
        },
      ),
    ],
  });
  logs.setGlobalLoggerProvider(loggerProvider);
  initialized = true;
}

export function exportLogEntry(entry: OtelLogEntry) {
  if (typeof window !== "undefined") return;
  initializeLogsExporter();
  if (!loggerProvider) return;

  const span = trace.getActiveSpan();
  const spanContext = span?.spanContext();
  const logger = logs.getLogger(
    process.env.OTEL_SERVICE_NAME ?? "hackclub-photos",
    process.env.APP_VERSION,
  );
  const attributes = sanitizeAttributes({
    ...entry.attributes,
    "service.name": process.env.OTEL_SERVICE_NAME ?? "hackclub-photos",
    "deployment.environment":
      process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV,
    ...(spanContext
      ? {
          trace_id: spanContext.traceId,
          span_id: spanContext.spanId,
          trace_flags: `0${spanContext.traceFlags.toString(16)}`,
        }
      : {}),
  });

  logger.emit({
    body: entry.message,
    timestamp: Date.now(),
    observedTimestamp: Date.now(),
    severityNumber: severityNumber(entry.level),
    severityText: entry.level.toUpperCase(),
    attributes,
    context: context.active(),
    ...(entry.error ? { exception: entry.error } : {}),
  });
}

export async function shutdownLogsExporter() {
  await loggerProvider?.shutdown();
}
