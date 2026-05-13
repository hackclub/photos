import { registerOTel } from "@vercel/otel";

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "hackclub-photos",
  });
}
