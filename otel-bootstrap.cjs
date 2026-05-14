const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const {
  OTLPMetricExporter,
} = require("@opentelemetry/exporter-metrics-otlp-http");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const { HostMetrics } = require("@opentelemetry/host-metrics");
const { PinoInstrumentation } = require("@opentelemetry/instrumentation-pino");
const { resourceFromAttributes } = require("@opentelemetry/resources");
const {
  MeterProvider,
  PeriodicExportingMetricReader,
} = require("@opentelemetry/sdk-metrics");
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

function buildResourceAttributes(
  serviceName,
  serviceVersion,
  environment,
  instanceId,
) {
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

  return {
    ...envAttributes,
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_NAMESPACE]: envAttributes[ATTR_SERVICE_NAMESPACE] ?? "photos",
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]:
      envAttributes[ATTR_DEPLOYMENT_ENVIRONMENT_NAME] ?? environment,
    ...(serviceVersion ? { [ATTR_SERVICE_VERSION]: serviceVersion } : {}),
    ...(instanceId ? { [ATTR_SERVICE_INSTANCE_ID]: instanceId } : {}),
  };
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
  const resource = resourceFromAttributes(
    buildResourceAttributes(
      serviceName,
      serviceVersion,
      environment,
      instanceId,
    ),
  );
  const appMetricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: signalUrl("metrics"),
      headers,
    }),
    exportIntervalMillis: Number(
      process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 60000,
    ),
  });
  const hostMetricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: signalUrl("metrics"),
      headers,
    }),
    exportIntervalMillis: Number(
      process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 60000,
    ),
  });
  const hostMeterProvider = new MeterProvider({
    resource,
    readers: [hostMetricReader],
  });
  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: signalUrl("traces"),
      headers,
    }),
    metricReader: appMetricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
        "@opentelemetry/instrumentation-pino": { enabled: false },
      }),
      new PinoInstrumentation({
        disableLogSending: true,
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
  const hostMetrics = new HostMetrics({
    name: "hackclub-photos-host-metrics",
    meterProvider: hostMeterProvider,
  });
  hostMetrics.start();

  const shutdown = (signal) => {
    console.log("application shutting down", {
      service: serviceName,
      version: serviceVersion,
      environment,
      instanceId,
      signal,
    });

    import("./lib/logs-exporter.ts")
      .then(({ shutdownLogsExporter }) => shutdownLogsExporter())
      .catch(() => undefined)
      .then(() => Promise.all([sdk.shutdown(), hostMeterProvider.shutdown()]))
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
