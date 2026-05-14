import { metrics, SpanStatusCode, trace } from "@opentelemetry/api";

const meter = metrics.getMeter("hackclub-photos-app");

export const photoUploadsTotal = meter.createCounter("photo_uploads_total", {
  description: "Total number of finalized photo uploads",
  unit: "1",
});

export const failedUploadsTotal = meter.createCounter("failed_uploads_total", {
  description: "Total number of failed upload flows",
  unit: "1",
});

export const thumbnailGenerationDuration = meter.createHistogram(
  "thumbnail_generation_duration_ms",
  {
    description: "Thumbnail generation duration",
    unit: "ms",
  },
);

export const imageProcessingDuration = meter.createHistogram(
  "image_processing_duration_ms",
  {
    description: "Image processing duration",
    unit: "ms",
  },
);

export const storageOperationDuration = meter.createHistogram(
  "storage_operation_duration_ms",
  {
    description: "S3/storage operation duration",
    unit: "ms",
  },
);

export const storageOperationsTotal = meter.createCounter(
  "storage_operations_total",
  {
    description: "Total number of S3/storage operations",
    unit: "1",
  },
);

export const cronJobDuration = meter.createHistogram("cron_job_duration_ms", {
  description: "Cron job route duration",
  unit: "ms",
});

export const cronJobsTotal = meter.createCounter("cron_jobs_total", {
  description: "Total number of cron job runs",
  unit: "1",
});

export async function traceAsync<T>(
  name: string,
  attributes: Record<string, string | number | boolean | undefined>,
  fn: () => Promise<T>,
) {
  const tracer = trace.getTracer("hackclub-photos-app");
  return await tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      } else {
        span.recordException(String(error));
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

export function durationMs(startedAt: number) {
  return Date.now() - startedAt;
}

export function recordStorageOperation(
  operation: string,
  status: "success" | "error",
  startedAt: number,
) {
  const attributes = { operation, status };
  storageOperationDuration.record(durationMs(startedAt), attributes);
  storageOperationsTotal.add(1, attributes);
}

export function recordCronJob(
  job: string,
  status: "success" | "error" | "unauthorized",
  startedAt: number,
) {
  const attributes = { job, status };
  cronJobDuration.record(durationMs(startedAt), attributes);
  cronJobsTotal.add(1, attributes);
}
