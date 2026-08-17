"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  HiArrowPath,
  HiCamera,
  HiCheck,
  HiFaceSmile,
  HiShieldCheck,
  HiSparkles,
  HiTrash,
  HiXMark,
} from "react-icons/hi2";
import ConfirmModal from "@/components/ui/ConfirmModal";

type Scan = {
  id: string;
  isActive: boolean;
  highQuality: boolean;
  quality: number | null;
  spoofQuality: number | null;
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
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
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
  const [showDesktopCamera, setShowDesktopCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<number | null>(null);
  const phonePollRef = useRef<number | null>(null);
  const phonePollGenerationRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const cameraGenerationRef = useRef(0);
  const completedPhoneScanRef = useRef<string | null>(null);
  const initializeOnOpen = useEffectEvent(async () => {
    const savedAutoSuggestions = await loadScans();
    if (window.matchMedia("(min-width: 768px)").matches) {
      await createPhoneCapture(savedAutoSuggestions);
    }
  });
  const cleanUpOnClose = useEffectEvent(cleanUp);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Effect Events stay out of dependency arrays.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setPhoneCapture(null);
    setShowDesktopCamera(false);
    completedPhoneScanRef.current = null;
    void initializeOnOpen();
    return cleanUpOnClose;
  }, [open]);

  async function loadScans() {
    try {
      const response = await fetch("/api/face/scans", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not load saved scans");
      setScans(body.scans);
      setAutoSuggestions(body.autoSuggestionsEnabled);
      return Boolean(body.autoSuggestionsEnabled);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load saved scans",
      );
      return true;
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
  }

  function cleanUp() {
    stopCamera();
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    if (phonePollRef.current) window.clearTimeout(phonePollRef.current);
    phonePollRef.current = null;
    phonePollGenerationRef.current++;
    if (phoneCapture && phoneCapture.status !== "completed") {
      void fetch(`/api/face/capture-sessions/${phoneCapture.token}`, {
        method: "DELETE",
        keepalive: true,
      });
    }
  }

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot access a camera. Try Safari or Chrome.");
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
      const denied =
        cameraError instanceof DOMException &&
        cameraError.name === "NotAllowedError";
      setError(
        denied
          ? "Camera permission was denied. Allow access and try again."
          : "The camera could not start. Close other camera apps and try again.",
      );
    }
  }

  async function captureFrame(track: MediaStreamTrack): Promise<Blob> {
    void track;
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
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    setCapturing(true);
    setError(null);
    try {
      const frames: Blob[] = [];
      for (let index = 0; index < 6; index++) {
        frames.push(await captureFrame(track));
        if (index < 5) await new Promise((resolve) => setTimeout(resolve, 350));
      }
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
          : "Face capture failed.",
      );
    } finally {
      setCapturing(false);
    }
  }

  async function search(scanId: string, poll = false) {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/face/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, scanId, mode, poll }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Face search failed");
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
      )
        return;
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Face search failed",
      );
    } finally {
      setLoading(false);
    }
  }

  async function deleteScan() {
    if (!deleteScanId) return;
    const response = await fetch(`/api/face/scans/${deleteScanId}`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => null);
    if (response.ok) await loadScans();
    else setError(body?.error || "Could not delete face scan");
    setDeleteScanId(null);
  }

  async function createPhoneCapture(
    suggestionsEnabled: boolean = autoSuggestions,
  ) {
    if (creatingPhoneCapture) return;
    setCreatingPhoneCapture(true);
    setError(null);
    try {
      const response = await fetch("/api/face/capture-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId,
          mode,
          autoSuggestions: suggestionsEnabled,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not create phone capture");
      const capture: PhoneCapture = { ...body, status: "created" };
      setPhoneCapture(capture);
      const generation = ++phonePollGenerationRef.current;
      schedulePhonePoll(capture.token, generation);
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : "Could not create phone capture",
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
      if (!response.ok) throw new Error(body.error || "Phone capture expired");
      setPhoneCapture((current) =>
        current ? { ...current, ...body } : current,
      );
      if (body.status === "completed" && body.scanId) {
        if (completedPhoneScanRef.current !== body.scanId) {
          completedPhoneScanRef.current = body.scanId;
          await loadScans();
          await search(body.scanId);
        }
        return;
      }
      if (body.status === "failed") {
        setError(
          body.error || "The phone capture failed. Try again on your phone.",
        );
      }
      schedulePhonePoll(token, generation);
    } catch (pollError) {
      if (generation !== phonePollGenerationRef.current) return;
      setError(
        pollError instanceof Error
          ? pollError.message
          : "Phone capture unavailable",
      );
      phonePollRef.current = window.setTimeout(() => {
        void pollPhoneCapture(token, generation);
      }, 3000);
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/65 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
        aria-labelledby="face-drawer-title"
        aria-modal="true"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-zinc-800 p-5">
          <div>
            <h2
              id="face-drawer-title"
              className="flex items-center gap-2 text-lg font-bold text-white"
            >
              {mode === "blur" ? (
                <HiShieldCheck className="h-5 w-5 text-red-400" />
              ) : (
                <HiSparkles className="h-5 w-5 text-cyan-400" />
              )}
              {mode === "blur" ? "Find photos to blur" : "Includes me"}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {mode === "blur"
                ? "Use a recent high-quality scan to find your face."
                : "Filter this event to photos that appear to include you."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
            aria-label="Close"
          >
            <HiXMark className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">
            <p>
              Camera frames stay on Hack Club infrastructure only while the scan
              is checked. They are then discarded. You can delete the saved face
              template at any time.
            </p>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          {progress && progress.indexed < progress.total ? (
            <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-cyan-200">Indexing this event</span>
                <span className="text-zinc-400">
                  {progress.indexed}/{progress.total}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-cyan-500 transition-all duration-500"
                  style={{
                    width: `${progress.total ? (progress.indexed / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {scans.length > 0 ? (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-zinc-300">
                Saved scans
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {scans.map((scan) => (
                  <div
                    key={scan.id}
                    className="group relative rounded-xl border border-zinc-800 bg-zinc-900 p-3"
                  >
                    <button
                      type="button"
                      onClick={() => search(scan.id)}
                      disabled={
                        loading || (mode === "blur" && !scan.highQuality)
                      }
                      className="w-full text-left disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
                        <HiFaceSmile className="h-7 w-7 text-zinc-400" />
                      </div>
                      <p className="text-sm font-medium text-white">
                        {new Date(scan.createdAt).toLocaleDateString()}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {scan.highQuality ? "High quality" : "Standard"}
                        {scan.isActive ? " · Latest" : ""}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteScanId(scan.id)}
                      className="absolute right-2 top-2 rounded-lg bg-zinc-950 p-2 text-zinc-400 transition hover:text-red-400 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                      aria-label="Delete face scan"
                    >
                      <HiTrash className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="hidden space-y-4 md:block">
            <div className="rounded-2xl border border-red-500/40 bg-red-950/25 p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-red-200">
                <HiSparkles className="h-5 w-5" /> Recommended
              </div>
              <h3 className="mt-2 text-lg font-bold text-white">
                Scan with your phone
              </h3>
              <p className="mt-1 text-sm leading-5 text-zinc-400">
                Your phone’s front camera is usually faster and easier. No login
                needed.
              </p>
              {phoneCapture ? (
                <div className="mt-5">
                  <div className="mx-auto w-fit rounded-2xl bg-white p-3">
                    <QRCodeSVG value={phoneCapture.url} size={184} level="M" />
                  </div>
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-zinc-200">
                    {phoneCapture.status === "created" ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-red-400" />{" "}
                        Scan this code with your phone
                      </>
                    ) : phoneCapture.status === "opened" ? (
                      <>
                        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                        Phone connected · waiting for scan
                      </>
                    ) : phoneCapture.status === "processing" ? (
                      <>
                        <HiArrowPath className="h-4 w-4 animate-spin text-cyan-400" />
                        Checking the phone scan
                      </>
                    ) : phoneCapture.status === "completed" ? (
                      <>
                        <HiCheck className="h-4 w-4 text-emerald-400" /> Scan
                        complete
                      </>
                    ) : (
                      <span className="text-red-300">
                        Try again on your phone
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void createPhoneCapture()}
                  disabled={creatingPhoneCapture}
                  className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-500 disabled:bg-zinc-700"
                >
                  {creatingPhoneCapture ? (
                    <HiArrowPath className="h-5 w-5 animate-spin" />
                  ) : (
                    <HiCamera className="h-5 w-5" />
                  )}
                  {creatingPhoneCapture
                    ? "Creating secure link…"
                    : "Show phone QR code"}
                </button>
              )}
            </div>
            {!showDesktopCamera ? (
              <button
                type="button"
                onClick={() => setShowDesktopCamera(true)}
                className="mx-auto block rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-300"
              >
                Use this computer’s camera instead
              </button>
            ) : null}
          </section>

          <section
            className={`space-y-3 ${showDesktopCamera ? "md:block" : "md:hidden"}`}
          >
            <div>
              <h3 className="text-sm font-semibold text-zinc-300">
                {scans.length ? "Create another scan" : "Set up face matching"}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Look at the camera for about two seconds. Keep your face
                centered and remove anything covering it.
              </p>
            </div>
            <div className="relative aspect-4/3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`h-full w-full scale-x-[-1] object-cover ${cameraReady ? "opacity-100" : "opacity-0"}`}
              />
              {!cameraReady ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
                  <HiCamera className="h-9 w-9" />
                  <span className="mt-2 text-sm">Camera is off</span>
                </div>
              ) : (
                <div className="pointer-events-none absolute inset-[12%] rounded-[42%] border border-white/70" />
              )}
            </div>
            {!cameraReady ? (
              <button
                type="button"
                onClick={startCamera}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-white"
              >
                <HiCamera className="h-5 w-5" />
                Use camera
              </button>
            ) : (
              <button
                type="button"
                onClick={createScan}
                disabled={capturing}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500 disabled:bg-zinc-700"
              >
                {capturing ? (
                  <HiArrowPath className="h-5 w-5 animate-spin" />
                ) : (
                  <HiCheck className="h-5 w-5" />
                )}
                {capturing ? "Checking capture..." : "Scan my face"}
              </button>
            )}
            <label className="flex items-start gap-3 rounded-xl border border-zinc-800 p-3 text-xs text-zinc-400">
              <input
                type="checkbox"
                aria-label="Automatic suggestions"
                checked={autoSuggestions}
                onChange={(event) => setAutoSuggestions(event.target.checked)}
                className="mt-0.5 accent-red-600"
              />
              Suggest photos from events I join when the match is confident.
            </label>
          </section>
          {mode === "blur" && onManual ? (
            <button
              type="button"
              onClick={onManual}
              className="w-full rounded-lg py-2 text-xs font-medium text-zinc-500 hover:text-zinc-300"
            >
              Select photos and blur areas manually instead
            </button>
          ) : null}
        </div>
      </aside>

      <ConfirmModal
        isOpen={Boolean(deleteScanId)}
        onClose={() => setDeleteScanId(null)}
        onConfirm={deleteScan}
        title="Delete face scan"
        message="This removes the saved template and suggestions created from it. Confirmed mentions and completed blur requests stay unchanged."
        confirmText="Delete scan"
        cancelText="Cancel"
        danger
      />
    </>
  );
}

function captureError(reason?: string, fallback?: string) {
  if (reason === "SPOOF")
    return "The liveness check did not pass. Use the live camera without a screen or printed photo.";
  if (reason === "STALE_CAPTURE")
    return "The capture did not contain enough live camera changes. Try again.";
  if (reason === "LOW_QUALITY" || reason === "LOW_SPOOF_QUALITY") {
    return "The capture quality was too low. Use brighter light and keep the camera steady.";
  }
  if (reason === "NO_SINGLE_FACE")
    return "Keep exactly one face centered in the frame.";
  if (reason === "FACE_MISMATCH")
    return "This does not match your existing face scan. Delete your saved face data first if you need to enroll a different person.";
  return fallback || "Face capture failed.";
}
