"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  HiChevronRight,
  HiComputerDesktop,
  HiDevicePhoneMobile,
  HiPlus,
  HiXMark,
} from "react-icons/hi2";
import ConfirmModal from "@/components/ui/ConfirmModal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

type Scan = {
  id: string;
  isActive: boolean;
  highQuality: boolean;
  createdAt: string;
};

type FaceMatch = {
  detectionId: string;
  mediaId: string;
  similarity: number;
  region: { x: number; y: number; width: number; height: number };
};

type PhoneCapture = {
  token: string;
  url: string;
  status: "created" | "opened" | "processing" | "completed" | "failed";
  scanId?: string;
  error?: string;
};

type Step =
  | "loading"
  | "intro"
  | "method"
  | "phone"
  | "camera"
  | "processing"
  | "scans";

const MAX_BLUR_SCAN_AGE = 30 * 24 * 60 * 60 * 1000;

function canUseScan(scan: Scan, mode: "filter" | "blur") {
  if (mode === "filter") return true;
  const createdAt = new Date(scan.createdAt).getTime();
  return (
    scan.highQuality &&
    Number.isFinite(createdAt) &&
    Date.now() - createdAt <= MAX_BLUR_SCAN_AGE
  );
}

export default function IncludesMeDrawer({
  eventId,
  open,
  mode = "filter",
  onClose,
  onApply,
  onManual,
}: {
  eventId: string;
  open: boolean;
  mode?: "filter" | "blur";
  onClose: () => void;
  onApply: (matches: FaceMatch[], scanId: string) => void;
  onManual?: () => void;
}) {
  const [scans, setScans] = useState<Scan[]>([]);
  const [step, setStep] = useState<Step>("loading");
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    indexed: number;
    total: number;
    status: string;
  } | null>(null);
  const [autoSuggestions, setAutoSuggestions] = useState(true);
  const [deleteScanId, setDeleteScanId] = useState<string | null>(null);
  const [phoneCapture, setPhoneCapture] = useState<PhoneCapture | null>(null);
  const [creatingPhoneCapture, setCreatingPhoneCapture] = useState(false);
  const [processingText, setProcessingText] = useState("Checking your face");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<number | null>(null);
  const phonePollRef = useRef<number | null>(null);
  const phonePollGenerationRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const cameraGenerationRef = useRef(0);
  const completedPhoneScanRef = useRef<string | null>(null);
  const usableScans = scans.filter((scan) => canUseScan(scan, mode));

  const initializeOnOpen = useEffectEvent(async () => {
    const loaded = await loadScans();
    const available = loaded.scans.filter((scan) => canUseScan(scan, mode));
    setStep(available.length > 0 ? "scans" : "intro");
  });
  const cleanUpOnClose = useEffectEvent(cleanUp);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Effect Events stay out of dependency arrays.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setProgress(null);
    setPhoneCapture(null);
    setStep("loading");
    completedPhoneScanRef.current = null;
    void initializeOnOpen();
    return cleanUpOnClose;
  }, [open]);

  async function loadScans() {
    try {
      const response = await fetch("/api/face/scans", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load faces");
      const loadedScans = body.scans as Scan[];
      const suggestionsEnabled = Boolean(body.autoSuggestionsEnabled);
      setScans(loadedScans);
      setAutoSuggestions(suggestionsEnabled);
      return { scans: loadedScans, autoSuggestions: suggestionsEnabled };
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load faces",
      );
      return { scans: [] as Scan[], autoSuggestions: true };
    }
  }

  function stopCamera() {
    cameraGenerationRef.current++;
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
    if (pollRef.current) window.clearTimeout(pollRef.current);
    pollRef.current = null;
    setCameraReady(false);
    setCameraStarting(false);
  }

  function stopPhoneCapture() {
    if (phonePollRef.current) window.clearTimeout(phonePollRef.current);
    phonePollRef.current = null;
    phonePollGenerationRef.current++;
    const capture = phoneCapture;
    setPhoneCapture(null);
    if (capture && capture.status !== "completed") {
      void fetch(`/api/face/capture-sessions/${capture.token}`, {
        method: "DELETE",
        keepalive: true,
      });
    }
  }

  function cleanUp() {
    stopCamera();
    stopPhoneCapture();
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
  }

  function beginSetup() {
    setError(null);
    setProgress(null);
    if (window.matchMedia("(min-width: 768px)").matches) {
      setStep("method");
      return;
    }
    setStep("camera");
    void startCamera();
  }

  async function startCamera() {
    setError(null);
    setCameraStarting(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStarting(false);
      setError("This browser cannot use the camera.");
      return;
    }
    const generation = ++cameraGenerationRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });
      if (generation !== cameraGenerationRef.current) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (cameraError) {
      stopCamera();
      const denied =
        cameraError instanceof DOMException &&
        cameraError.name === "NotAllowedError";
      setError(
        denied
          ? "Allow camera access, then try again."
          : "The camera could not start.",
      );
    } finally {
      setCameraStarting(false);
    }
  }

  async function captureFrame(): Promise<Blob> {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      throw new Error("Camera is not ready");
    }
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      1,
      720 / Math.max(video.videoWidth, video.videoHeight),
    );
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas
      .getContext("2d")
      ?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Capture failed"))),
        "image/jpeg",
        0.78,
      ),
    );
  }

  async function createScan() {
    if (!streamRef.current?.getVideoTracks()[0] || capturing) return;
    setCapturing(true);
    setError(null);
    try {
      const frames: Blob[] = [];
      for (let index = 0; index < 6; index++) {
        frames.push(await captureFrame());
        if (index < 5) await new Promise((resolve) => setTimeout(resolve, 350));
      }
      setProcessingText("Checking your face");
      setStep("processing");
      stopCamera();
      const form = new FormData();
      form.set("eventId", eventId);
      form.set("highQuality", String(mode === "blur"));
      form.set("autoSuggestions", String(autoSuggestions));
      frames.forEach((frame, index) => {
        form.append("frames", frame, `capture-${index}.jpg`);
      });
      const response = await fetch("/api/face/scans", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(captureError(body.reason, body.error));
      await loadScans();
      await search(body.scan.id);
    } catch (captureFailure) {
      setError(
        captureFailure instanceof Error
          ? captureFailure.message
          : "We could not use that scan.",
      );
      setStep("camera");
    } finally {
      setCapturing(false);
    }
  }

  async function search(scanId: string, poll = false) {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setProcessingText("Looking through photos");
    setStep("processing");
    setError(null);
    try {
      const response = await fetch("/api/face/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, scanId, mode, poll }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not search photos");
      setProgress(body.progress);
      const complete = body.progress.indexed >= body.progress.total;
      if (mode === "filter" || complete) onApply(body.matches, body.scanId);
      if (complete) {
        onClose();
      } else {
        pollRef.current = window.setTimeout(
          () => void search(scanId, true),
          2500,
        );
      }
    } catch (searchError) {
      if (
        searchError instanceof DOMException &&
        searchError.name === "AbortError"
      ) {
        return;
      }
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Could not search photos",
      );
      setStep(usableScans.length > 0 ? "scans" : "intro");
    }
  }

  async function deleteScan() {
    if (!deleteScanId) return;
    const response = await fetch(`/api/face/scans/${deleteScanId}`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      const loaded = await loadScans();
      const remaining = loaded.scans.filter((scan) => canUseScan(scan, mode));
      if (remaining.length === 0) setStep("intro");
    } else {
      setError(body?.error || "Could not remove face");
    }
    setDeleteScanId(null);
  }

  async function createPhoneCapture() {
    if (creatingPhoneCapture) return;
    const generation = ++phonePollGenerationRef.current;
    setStep("phone");
    setCreatingPhoneCapture(true);
    setError(null);
    try {
      const response = await fetch("/api/face/capture-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId,
          mode,
          autoSuggestions,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not make QR code");
      if (generation !== phonePollGenerationRef.current) {
        void fetch(`/api/face/capture-sessions/${body.token}`, {
          method: "DELETE",
          keepalive: true,
        });
        return;
      }
      const capture: PhoneCapture = { ...body, status: "created" };
      setPhoneCapture(capture);
      schedulePhonePoll(capture.token, generation);
    } catch (captureFailure) {
      setError(
        captureFailure instanceof Error
          ? captureFailure.message
          : "Could not make QR code",
      );
    } finally {
      setCreatingPhoneCapture(false);
    }
  }

  function schedulePhonePoll(token: string, generation: number) {
    if (phonePollRef.current) window.clearTimeout(phonePollRef.current);
    phonePollRef.current = window.setTimeout(() => {
      void pollPhoneCapture(token, generation);
    }, 900);
  }

  async function pollPhoneCapture(token: string, generation: number) {
    try {
      const response = await fetch(`/api/face/capture-sessions/${token}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (generation !== phonePollGenerationRef.current) return;
      if (!response.ok) throw new Error(body.error || "QR code expired");
      setPhoneCapture((current) =>
        current ? { ...current, ...body } : current,
      );
      if (body.status === "completed" && body.scanId) {
        if (completedPhoneScanRef.current !== body.scanId) {
          completedPhoneScanRef.current = body.scanId;
          setProcessingText("Looking through photos");
          setStep("processing");
          await loadScans();
          await search(body.scanId);
        }
        return;
      }
      if (body.status === "failed") {
        setError(body.error || "Try again on your phone.");
        return;
      }
      schedulePhonePoll(token, generation);
    } catch (pollError) {
      if (generation !== phonePollGenerationRef.current) return;
      setError(
        pollError instanceof Error ? pollError.message : "Phone disconnected",
      );
      phonePollRef.current = window.setTimeout(() => {
        void pollPhoneCapture(token, generation);
      }, 3000);
    }
  }

  function backToSetup() {
    stopCamera();
    stopPhoneCapture();
    setError(null);
    setStep("method");
  }

  const title =
    step === "scans"
      ? mode === "blur"
        ? "Choose a face"
        : "Find me"
      : "Face setup";

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        className={`fixed inset-0 z-[60] bg-black/65 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        disabled={!open}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-[60] flex w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
        aria-labelledby="face-drawer-title"
        aria-modal="true"
        role="dialog"
        inert={!open}
      >
        <header className="flex min-h-16 items-center justify-between border-b border-zinc-800 px-5">
          <h2
            id="face-drawer-title"
            className="text-lg font-semibold text-white"
          >
            {title}
          </h2>
          <div className="flex items-center gap-1">
            {step === "scans" ? (
              <button
                type="button"
                onClick={beginSetup}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
                aria-label="Add face"
              >
                <HiPlus className="h-5 w-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
              aria-label="Close"
            >
              <HiXMark className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {error ? <p className="mb-5 text-sm text-red-400">{error}</p> : null}

          {step === "loading" ? (
            <div className="flex min-h-full items-center justify-center">
              <LoadingSpinner size="xl" />
            </div>
          ) : null}

          {step === "intro" ? (
            <section className="face-step flex min-h-full flex-col justify-between gap-10">
              <div className="pt-8">
                <p className="text-xs text-zinc-500">Step 1 of 2</p>
                <h3 className="mt-3 text-2xl font-semibold text-white">
                  {mode === "blur"
                    ? "Find photos to blur"
                    : "Find photos of you"}
                </h3>
                <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-400">
                  {mode === "blur"
                    ? "Add your face, then choose which photos to blur."
                    : "Add your face to filter this event."}
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={beginSetup}
                  className="min-h-12 w-full rounded-xl bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Continue
                </button>
                {mode === "blur" && onManual ? (
                  <button
                    type="button"
                    onClick={onManual}
                    className="min-h-11 w-full text-sm text-zinc-400 transition-colors hover:text-white"
                  >
                    Choose photos yourself
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {step === "method" ? (
            <section className="face-step">
              <button
                type="button"
                onClick={() => setStep(usableScans.length ? "scans" : "intro")}
                className="mb-8 text-sm text-zinc-400 hover:text-white"
              >
                Back
              </button>
              <p className="text-xs text-zinc-500">Step 2 of 2</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">
                Choose a camera
              </h3>
              <div className="mt-8 space-y-3">
                <button
                  type="button"
                  onClick={() => void createPhoneCapture()}
                  className="flex min-h-20 w-full items-center gap-4 rounded-xl border border-red-600/50 bg-red-600/10 px-4 py-4 text-left transition-colors hover:border-red-500 hover:bg-red-600/20"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-600/20 text-red-400">
                    <HiDevicePhoneMobile className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-white">Use my phone</span>
                      <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Recommended
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-zinc-400">
                      Scan a QR code
                    </span>
                  </span>
                  <HiChevronRight className="h-5 w-5 shrink-0 text-zinc-500" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("camera");
                    void startCamera();
                  }}
                  className="flex min-h-20 w-full items-center gap-4 rounded-xl px-4 py-4 text-left transition-colors hover:bg-zinc-800/60"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400">
                    <HiComputerDesktop className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-medium text-white">
                      Use this computer
                    </span>
                    <span className="mt-1 block text-sm text-zinc-400">
                      Open this camera
                    </span>
                  </span>
                  <HiChevronRight className="h-5 w-5 shrink-0 text-zinc-500" />
                </button>
              </div>
            </section>
          ) : null}

          {step === "phone" ? (
            <section className="face-step text-center">
              <button
                type="button"
                onClick={backToSetup}
                className="mb-8 block text-sm text-zinc-400 hover:text-white"
              >
                Back
              </button>
              <p className="text-xs text-zinc-500">Step 2 of 2</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">
                Scan this code
              </h3>
              {phoneCapture ? (
                <>
                  <div className="mx-auto mt-8 w-fit rounded-xl bg-white p-3">
                    <QRCodeSVG value={phoneCapture.url} size={196} level="M" />
                  </div>
                  <p className="mt-5 text-sm text-zinc-400">
                    {phoneCapture.status === "created"
                      ? "Open it with your phone."
                      : phoneCapture.status === "opened"
                        ? "Phone connected."
                        : phoneCapture.status === "processing"
                          ? "Checking your face..."
                          : phoneCapture.status === "completed"
                            ? "Done."
                            : "Try again."}
                  </p>
                </>
              ) : creatingPhoneCapture ? (
                <div className="mt-16 flex justify-center">
                  <LoadingSpinner size="xl" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void createPhoneCapture()}
                  className="mt-8 min-h-12 w-full rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Try again
                </button>
              )}
            </section>
          ) : null}

          {step === "camera" ? (
            <section className="face-step">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setStep(
                    window.matchMedia("(min-width: 768px)").matches
                      ? "method"
                      : usableScans.length
                        ? "scans"
                        : "intro",
                  );
                }}
                className="mb-6 text-sm text-zinc-400 hover:text-white"
              >
                Back
              </button>
              <p className="text-xs text-zinc-500">Step 2 of 2</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">
                Look at the camera
              </h3>
              <p className="mt-2 text-sm text-zinc-400">
                Keep still for a moment.
              </p>
              <div className="relative mt-6 aspect-4/3 overflow-hidden rounded-xl bg-black">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className={`h-full w-full scale-x-[-1] object-cover transition-opacity duration-300 ${cameraReady ? "opacity-100" : "opacity-0"}`}
                />
                {!cameraReady ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    {cameraStarting ? (
                      <LoadingSpinner size="xl" />
                    ) : (
                      <span className="text-sm text-zinc-500">
                        Camera is off
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
              {cameraReady ? (
                <button
                  type="button"
                  onClick={() => void createScan()}
                  disabled={capturing}
                  className="mt-4 min-h-12 w-full rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {capturing ? "Hold still..." : "Continue"}
                </button>
              ) : !cameraStarting ? (
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="mt-4 min-h-12 w-full rounded-xl bg-zinc-100 px-5 text-sm font-semibold text-zinc-950 hover:bg-white"
                >
                  Turn on camera
                </button>
              ) : null}
            </section>
          ) : null}

          {step === "processing" ? (
            <section className="face-step flex min-h-full flex-col items-center justify-center text-center">
              <LoadingSpinner size="xl" />
              <h3 className="mt-6 text-lg font-medium text-white">
                {processingText}
              </h3>
              {progress && progress.total > progress.indexed ? (
                <p className="mt-2 text-sm text-zinc-500">
                  {progress.indexed} of {progress.total}
                </p>
              ) : null}
            </section>
          ) : null}

          {step === "scans" ? (
            <section className="face-step">
              <p className="mb-6 text-sm text-zinc-400">
                {mode === "blur"
                  ? "Choose the face to look for."
                  : "Choose a saved face."}
              </p>
              <div className="divide-y divide-zinc-800 border-y border-zinc-800">
                {usableScans.map((scan, index) => (
                  <div
                    key={scan.id}
                    className="flex min-h-16 items-center gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => void search(scan.id)}
                      className="min-h-16 flex-1 py-3 text-left"
                    >
                      <span className="block text-sm font-medium text-white">
                        Face {index + 1}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        Added {new Date(scan.createdAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteScanId(scan.id)}
                      className="min-h-11 px-2 text-xs text-zinc-500 transition-colors hover:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              {mode === "blur" && onManual ? (
                <button
                  type="button"
                  onClick={onManual}
                  className="mt-6 min-h-11 w-full text-sm text-zinc-400 hover:text-white"
                >
                  Choose photos yourself
                </button>
              ) : null}
            </section>
          ) : null}
        </div>
      </aside>

      <ConfirmModal
        isOpen={Boolean(deleteScanId)}
        onClose={() => setDeleteScanId(null)}
        onConfirm={deleteScan}
        title="Remove face"
        message="Remove this saved face? You can add it again later."
        confirmText="Remove"
        cancelText="Cancel"
        danger
      />
    </>
  );
}

function captureError(reason?: string, fallback?: string) {
  if (reason === "SPOOF") return "Use the live camera, not a photo or screen.";
  if (reason === "STALE_CAPTURE") return "Hold still, then try again.";
  if (reason === "LOW_QUALITY" || reason === "LOW_SPOOF_QUALITY") {
    return "Move somewhere brighter and try again.";
  }
  if (reason === "NO_SINGLE_FACE") {
    return "Make sure only your face is in the photo.";
  }
  if (reason === "FACE_MISMATCH") {
    return "This does not match your saved face.";
  }
  return fallback || "We could not use that scan.";
}
