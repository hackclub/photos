import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { config } from "./config.js";
import { createLogger } from "./logger.js";

const log = createLogger(config.logLevel, "roc");

const require = createRequire(import.meta.url);
const rocPath = path.join(config.rocSdkRoot, "nodejs", "roc.node");
const libPath = path.join(config.rocSdkRoot, "lib");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const roc: any = require(rocPath);

export interface RocDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  confidence: number;
  pose: number;
  image_width: number;
  image_height: number;
  right_eye?: { x: number; y: number };
  left_eye?: { x: number; y: number };
  nose?: { x: number; y: number };
  chin?: { x: number; y: number };
}

export interface RocImage {
  width: number;
  height: number;
}

export interface FaceInfo {
  detection: RocDetection | null;
  quality: number;
  gender: string;
  age: number;
  geographicOrigin: string;
}

export const FACE_ALGORITHMS = {
  fast: roc.ROC_FACE_FAST_REPRESENTATION,
  accurate: roc.ROC_FACE_ACCURATE_REPRESENTATION,
  "very-accurate": roc.ROC_FACE_VERY_ACCURATE_REPRESENTATION,
} as const;

export type FaceAlgorithm = keyof typeof FACE_ALGORITHMS;

let initialized = false;

export function initRoc(): void {
  if (initialized) return;
  log.info(`loading ${rocPath}`);
  roc.roc_initialize(config.rocLicenseFile ?? null);
  roc.roc_set_model_path(libPath);
  initialized = true;
  log.info(`ROC SDK ${roc.roc_version_string()} ready (model path ${libPath})`);
}

export function finalizeRoc(): void {
  if (!initialized) return;
  roc.roc_finalize();
  initialized = false;
}

export function decodeImage(buffer: Buffer): Promise<RocImage> {
  return roc.roc_decode_image(buffer, roc.ROC_BGR24);
}

export function adaptiveMinSize(image: RocImage): number {
  return roc.roc_adaptive_minimum_size(
    image.width,
    image.height,
    roc.ROC_SUGGESTED_RELATIVE_MIN_SIZE,
    roc.ROC_SUGGESTED_ABSOLUTE_MIN_SIZE,
  );
}

export interface RepresentOptions {
  algorithm?: FaceAlgorithm;
  maxFaces?: number;
  minQuality?: number;
  analytics?: boolean;
}

export async function representFaces(
  image: RocImage,
  options: RepresentOptions = {},
): Promise<unknown[]> {
  const algorithm = FACE_ALGORITHMS[options.algorithm ?? "accurate"];
  const flags =
    roc.ROC_FACE_DETECTION |
    algorithm |
    (options.analytics === false ? 0 : roc.ROC_ANALYTICS);
  const minQuality =
    options.minQuality ??
    (options.algorithm === "fast"
      ? roc.ROC_FACE_FAST_SUGGESTED_MIN_QUALITY
      : options.algorithm === "very-accurate"
        ? roc.ROC_FACE_VERY_ACCURATE_SUGGESTED_MIN_QUALITY
        : roc.ROC_FACE_ACCURATE_SUGGESTED_MIN_QUALITY);
  return roc.roc_represent_face(
    image,
    flags,
    adaptiveMinSize(image),
    options.maxFaces ?? 20,
    roc.ROC_FACE_SUGGESTED_FALSE_DETECTION_RATE,
    minQuality,
  );
}

export function compareTemplates(a: unknown, b: unknown): number {
  return roc.roc_compare_templates(a, b);
}

export function getMetadata(template: unknown, key: string): string {
  return roc.roc_get_metadata(template, key);
}

export function getMetadataDouble(template: unknown, key: string): number {
  return roc.roc_get_metadata_double(template, key);
}

export function flattenTemplate(template: unknown): Buffer {
  return roc.roc_flatten(template);
}

export function unflattenTemplate(flat: Buffer): unknown {
  return roc.roc_unflatten(flat);
}

export function templateToBase64(template: unknown): string {
  return flattenTemplate(template).toString("base64");
}

export function templateFromBase64(encoded: string): unknown {
  return unflattenTemplate(Buffer.from(encoded, "base64"));
}

export function describeFace(template: unknown): FaceInfo {
  const detection =
    (template as { detection?: RocDetection | null }).detection ?? null;
  return {
    detection,
    quality: getMetadataDouble(template, "Quality"),
    gender: getMetadata(template, "Gender"),
    age: getMetadataDouble(template, "Age"),
    geographicOrigin: getMetadata(template, "GeographicOrigin"),
  };
}

export type LivenessFailureReason =
  | "NO_SINGLE_FACE"
  | "STALE_CAPTURE"
  | "LOW_QUALITY"
  | "LOW_SPOOF_QUALITY"
  | "SPOOF";

export type LivenessResult =
  | {
      ok: true;
      template: string;
      face: Pick<FaceInfo, "detection" | "quality">;
      spoof: number;
      spoofQuality: number;
      frameCount: number;
    }
  | {
      ok: false;
      reason: LivenessFailureReason;
      quality?: number;
      spoof?: number;
      spoofQuality?: number;
      frameCount: number;
    };

export async function verifyLivenessFrames(
  frames: Buffer[],
  highQuality: boolean,
): Promise<LivenessResult> {
  const uniqueFrames = new Set(
    frames.map((frame) => createHash("sha256").update(frame).digest("hex")),
  );
  if (uniqueFrames.size < 2) {
    return { ok: false, reason: "STALE_CAPTURE", frameCount: frames.length };
  }

  const candidates: {
    template: unknown;
    face: FaceInfo;
    spoof: number;
    spoofQuality: number;
  }[] = [];

  for (const frame of frames) {
    try {
      const image = await decodeImage(frame);
      const templates: unknown[] = await roc.roc_represent_face_ex(image, {
        algorithm_id:
          roc.ROC_FACE_DETECTION |
           roc.ROC_FACE_VERY_ACCURATE_REPRESENTATION |
          roc.ROC_SPOOF,
        relative_min_size: roc.ROC_SUGGESTED_RELATIVE_MIN_SIZE,
        absolute_min_size: roc.ROC_SUGGESTED_ABSOLUTE_MIN_SIZE,
        min_representation_size: 0,
         min_quality: roc.ROC_FACE_VERY_ACCURATE_SUGGESTED_MIN_QUALITY,
        min_spoof_quality: -1,
        maximum_templates: 2,
        false_detection_rate: roc.ROC_FACE_SUGGESTED_FALSE_DETECTION_RATE,
        roi_params: {},
        degrees: 0,
        thumbnail: false,
        ignore_partial: true,
        rotate_on_fte: false,
      });
      if (templates.length !== 1) continue;
      const template = templates[0];
      const spoof = getMetadataDouble(template, "Spoof");
      const spoofQuality = getMetadataDouble(template, "SpoofQuality");
      if (!Number.isFinite(spoof) || !Number.isFinite(spoofQuality)) continue;
      candidates.push({
        template,
        face: describeFace(template),
        spoof,
        spoofQuality,
      });
    } catch {
      // A short capture deliberately contains redundant frames; ignore bad ones.
    }
  }

  if (candidates.length === 0) {
    return { ok: false, reason: "NO_SINGLE_FACE", frameCount: frames.length };
  }

  candidates.sort((a, b) => b.spoofQuality - a.spoofQuality);
  const best = candidates[0]!;
  const minSpoofQuality = Number.isFinite(
    roc.ROC_DEFAULT_SPOOF_QUALITY_THRESHOLD,
  )
    ? roc.ROC_DEFAULT_SPOOF_QUALITY_THRESHOLD
    : -0.276;
  const spoofThreshold = Number.isFinite(roc.ROC_DEFAULT_SPOOF_THRESHOLD)
    ? roc.ROC_DEFAULT_SPOOF_THRESHOLD
    : 0.315;
  const requiredQuality = highQuality ? 0.85 : 0.55;

  if (best.spoofQuality < minSpoofQuality) {
    return {
      ok: false,
      reason: "LOW_SPOOF_QUALITY",
      spoofQuality: best.spoofQuality,
      quality: best.face.quality,
      frameCount: frames.length,
    };
  }
  if (best.spoof > spoofThreshold) {
    return {
      ok: false,
      reason: "SPOOF",
      spoof: best.spoof,
      spoofQuality: best.spoofQuality,
      quality: best.face.quality,
      frameCount: frames.length,
    };
  }
  if (
    !Number.isFinite(best.face.quality) ||
    best.face.quality < requiredQuality
  ) {
    return {
      ok: false,
      reason: "LOW_QUALITY",
      quality: best.face.quality,
      spoof: best.spoof,
      spoofQuality: best.spoofQuality,
      frameCount: frames.length,
    };
  }

  return {
    ok: true,
    template: templateToBase64(best.template),
    face: { detection: best.face.detection, quality: best.face.quality },
    spoof: best.spoof,
    spoofQuality: best.spoofQuality,
    frameCount: frames.length,
  };
}

export function templateIdToString(id: unknown): string {
  if (typeof id === "string") return id;
  return roc.roc_uuid_to_string(id, false);
}

// ---- Galleries -----------------------------------------------------------

export type GalleryHandle = unknown;

export function openGallery(location: string | null): Promise<GalleryHandle> {
  return roc.roc_open_gallery(location);
}

export function closeGallery(gallery: GalleryHandle): Promise<void> {
  return roc.roc_close_gallery(gallery);
}

export function gallerySize(gallery: GalleryHandle): Promise<number> {
  return roc.roc_size(gallery);
}

export function enroll(
  gallery: GalleryHandle,
  template: unknown,
): Promise<number> {
  return roc.roc_enroll(gallery, template);
}

export function removeAt(gallery: GalleryHandle, index: number): Promise<void> {
  return roc.roc_remove(gallery, index);
}

export function takeSnapshot(
  gallery: GalleryHandle,
  filePath: string,
): Promise<void> {
  return roc.roc_take_snapshot(gallery, filePath, false);
}

export interface RocCandidate {
  similarity: number;
  index: number;
  template_id: unknown;
}

export function searchGallery(
  gallery: GalleryHandle,
  probe: unknown,
  maxResults: number,
  minSimilarity: number,
): Promise<RocCandidate[]> {
  return roc.roc_search(gallery, probe, maxResults, minSimilarity);
}

export function templateAt(
  gallery: GalleryHandle,
  index: number,
): Promise<unknown> {
  return roc.roc_at(gallery, index);
}
