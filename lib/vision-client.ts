import "server-only";

const baseUrl = process.env.VISION_WORKER_URL ?? "http://127.0.0.1:3100";
const token = process.env.VISION_WORKER_TOKEN ?? process.env.VISION_TOKEN;

export class VisionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function visionRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(120_000),
  });
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new VisionRequestError(
      body?.error ?? `Vision worker returned ${response.status}`,
      response.status,
    );
  }
  return body as T;
}

export interface VisionDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  confidence: number;
  image_width: number;
  image_height: number;
}

export interface VisionFace {
  template: string;
  detection: VisionDetection;
  quality: number;
}

export function createFaceDetectionJob(payload: {
  jobId: string;
  s3Key: string;
  algorithm: "fast" | "accurate" | "very-accurate";
  maxFaces: number;
  minQuality?: number | null;
}) {
  return visionRequest<{ jobId: string }>("/v1/jobs", {
    method: "POST",
    body: JSON.stringify({
      jobId: payload.jobId,
      type: "detect-faces",
      payload: {
        image: { s3Key: payload.s3Key },
        algorithm: payload.algorithm,
        analytics: false,
        maxFaces: payload.maxFaces,
        ...(payload.minQuality == null
          ? {}
          : { minQuality: payload.minQuality }),
        includeTemplates: true,
      },
    }),
  });
}

export function getVisionJob(jobId: string) {
  return visionRequest<{
    status: string;
    result?: { faces?: VisionFace[] };
    error?: string;
  }>(`/v1/jobs/${encodeURIComponent(jobId)}`);
}

export function verifyFaceLiveness(frames: string[], highQuality: boolean) {
  return visionRequest<
    | {
        ok: true;
        template: string;
        face: { detection: VisionDetection; quality: number };
        spoof: number;
        spoofQuality: number;
        frameCount: number;
      }
    | {
        ok: false;
        reason: string;
        quality?: number;
        spoof?: number;
        spoofQuality?: number;
        frameCount: number;
      }
  >("/v1/liveness", {
    method: "POST",
    body: JSON.stringify({ frames, highQuality }),
  });
}

export function compareVisionTemplates(a: string, b: string) {
  return visionRequest<{ similarity: number }>("/v1/compare", {
    method: "POST",
    body: JSON.stringify({ a, b }),
  });
}

export function createVisionGallery(name: string) {
  return visionRequest<{ galleryId: string }>("/v1/galleries", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteVisionGallery(galleryId: string) {
  return visionRequest<{ ok: true }>(
    `/v1/galleries/${encodeURIComponent(galleryId)}`,
    { method: "DELETE" },
  );
}

export function enrollVisionTemplate(
  galleryId: string,
  template: string,
  metadata: Record<string, string | number>,
) {
  return visionRequest<{ index: number }>(
    `/v1/galleries/${encodeURIComponent(galleryId)}/templates`,
    { method: "POST", body: JSON.stringify({ template, metadata }) },
  );
}

export function searchVisionGallery(
  galleryId: string,
  template: string,
  options: { minSimilarity: number; maxResults?: number },
) {
  return visionRequest<{
    candidates: {
      similarity: number;
      index: number;
      templateId: string;
      detection: VisionDetection | null;
      metadata: { detectionId?: string; mediaId?: string } | null;
    }[];
  }>(`/v1/galleries/${encodeURIComponent(galleryId)}/search`, {
    method: "POST",
    body: JSON.stringify({
      probe: { template },
      maxResults: options.maxResults ?? 5000,
      minSimilarity: options.minSimilarity,
    }),
  });
}

export function getVisionQueue() {
  return visionRequest<{
    paused: boolean;
    counts: Record<string, number>;
    jobs: {
      id?: string;
      type: string;
      state: string;
      progress: unknown;
      attemptsMade: number;
      failedReason: string | null;
      createdAt: string;
      processedAt: string | null;
      finishedAt: string | null;
    }[];
  }>("/v1/admin/queue");
}

export function controlVisionQueue(action: "pause" | "resume" | "stop") {
  return visionRequest<{ ok: true; removed?: number; stopping?: number }>(
    `/v1/admin/queue/${action}`,
    { method: "POST", body: "{}" },
  );
}

export function cancelVisionJob(jobId: string) {
  return visionRequest<{ ok: true }>(`/v1/jobs/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
  });
}
