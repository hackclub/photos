import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { logger } from "@/lib/logger";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME ?? "hackclub-photos";
const serviceVersion = process.env.APP_VERSION;
const environment =
  process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";
const instanceId = process.env.HOSTNAME;
const safeEndpoint = endpoint?.startsWith("https://in-sig.deployor.dev")
  ? endpoint
  : undefined;

function signalUrl(signal: "traces" | "metrics" | "logs") {
  if (!safeEndpoint) return undefined;
  if (safeEndpoint.endsWith(`/v1/${signal}`)) return safeEndpoint;
  return `${safeEndpoint.replace(/\/$/, "")}/v1/${signal}`;
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

if (safeEndpoint) {
  const headers = parseHeaders();
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_NAMESPACE]: "photos",
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: environment,
    ...(serviceVersion ? { [ATTR_SERVICE_VERSION]: serviceVersion } : {}),
    ...(instanceId ? { [ATTR_SERVICE_INSTANCE_ID]: instanceId } : {}),
  });
  const sdk = new NodeSDK({
    resource,
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
    logRecordProcessors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: signalUrl("logs"),
          headers,
        }),
      ),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-pino": { enabled: false },
      }),
      new PinoInstrumentation({
        disableLogSending: false,
        disableLogCorrelation: false,
        logKeys: {
          traceId: "trace_id",
          spanId: "span_id",
          traceFlags: "trace_flags",
        },
      }),
    ],
  });

  sdk.start();

  new HostMetrics({ name: "hackclub-photos-host-metrics" }).start();

  logger.info(
    {
      service: serviceName,
      version: serviceVersion,
      environment,
      instanceId,
    },
    "application telemetry started",
  );

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info(
      {
        service: serviceName,
        version: serviceVersion,
        environment,
        instanceId,
        signal,
      },
      "application shutting down",
    );

    sdk
      .shutdown()
      .catch((error) => {
        logger.error({ error }, "OpenTelemetry shutdown failed");
      })
      .finally(() => process.exit(0));
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
} else if (endpoint) {
  logger.warn(
    { endpoint },
    "OpenTelemetry disabled because OTEL_EXPORTER_OTLP_ENDPOINT is not the SigNoz ingest endpoint",
  );
}
