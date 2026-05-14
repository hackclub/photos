const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const { OTLPLogExporter } = require("@opentelemetry/exporter-logs-otlp-http");
const {
  OTLPMetricExporter,
} = require("@opentelemetry/exporter-metrics-otlp-http");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const { HostMetrics } = require("@opentelemetry/host-metrics");
const { PinoInstrumentation } = require("@opentelemetry/instrumentation-pino");
const { resourceFromAttributes } = require("@opentelemetry/resources");
const { BatchLogRecordProcessor } = require("@opentelemetry/sdk-logs");
const { PeriodicExportingMetricReader } = require("@opentelemetry/sdk-metrics");
const { NodeSDK } = require("@opentelemetry/sdk-node");
const {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} = require("@opentelemetry/semantic-conventions");

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const safeEndpoint = endpoint?.startsWith("https://in-sig.deployor.dev")
  ? endpoint
  : undefined;

function signalUrl(signal) {
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

if (globalThis.__hackClubPhotosOtelStarted) {
  module.exports = globalThis.__hackClubPhotosOtelStarted;
} else if (safeEndpoint) {
  const serviceName = process.env.OTEL_SERVICE_NAME ?? "hackclub-photos";
  const serviceVersion = process.env.APP_VERSION;
  const environment =
    process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";
  const instanceId = process.env.HOSTNAME;
  const headers = parseHeaders();
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_NAMESPACE]: "photos",
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: environment,
      ...(serviceVersion ? { [ATTR_SERVICE_VERSION]: serviceVersion } : {}),
      ...(instanceId ? { [ATTR_SERVICE_INSTANCE_ID]: instanceId } : {}),
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

  const shutdown = (signal) => {
    console.log("application shutting down", {
      service: serviceName,
      version: serviceVersion,
      environment,
      instanceId,
      signal,
    });

    sdk
      .shutdown()
      .catch((error) => {
        console.error("OpenTelemetry shutdown failed", error);
      })
      .finally(() => process.exit(0));
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  globalThis.__hackClubPhotosOtelStarted = sdk;
  module.exports = sdk;
} else {
  if (endpoint) {
    console.warn(
      "OpenTelemetry disabled because OTEL_EXPORTER_OTLP_ENDPOINT is not the SigNoz ingest endpoint",
      { endpoint },
    );
  }
  module.exports = undefined;
}
