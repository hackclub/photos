import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
} from "@opentelemetry/semantic-conventions";
import { logger } from "@/lib/logger";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

function signalUrl(signal: "traces" | "metrics") {
  if (!endpoint) return undefined;
  if (endpoint.endsWith(`/v1/${signal}`)) return endpoint;
  return `${endpoint.replace(/\/$/, "")}/v1/${signal}`;
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

if (endpoint) {
  const headers = parseHeaders();
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "hackclub-photos",
      [ATTR_SERVICE_NAMESPACE]: "photos",
    }),
    traceExporter: new OTLPTraceExporter({
      url: signalUrl("traces"),
      headers,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: signalUrl("metrics"),
        headers,
      }),
      exportIntervalMillis: Number(
        process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 60000,
      ),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();

  new HostMetrics({ name: "hackclub-photos-host-metrics" }).start();

  process.once("SIGTERM", () => {
    sdk
      .shutdown()
      .catch((error) => {
        logger.error({ error }, "OpenTelemetry shutdown failed");
      })
      .finally(() => process.exit(0));
  });

  process.once("SIGINT", () => {
    sdk
      .shutdown()
      .catch((error) => {
        logger.error({ error }, "OpenTelemetry shutdown failed");
      })
      .finally(() => process.exit(0));
  });
}
