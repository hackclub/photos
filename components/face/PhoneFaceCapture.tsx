"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

type CaptureInfo = {
  status: "created" | "opened" | "processing" | "completed" | "failed";
  eventName: string;
  mode: "filter" | "blur";
  error?: string;
};

export default function PhoneFaceCapture({ token }: { token: string }) {
  const [info, setInfo] = useState<CaptureInfo | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraGeneration = useRef(0);
  const stopCameraEvent = useEffectEvent(stopCamera);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Effect Events stay out of dependency arrays.
  useEffect(() => {
    let cancelled = false;
    async function open() {
      const response = await fetch(`/api/face/capture-sessions/${token}`);
      if (!response.ok) {
        if (response.status === 404) {
          if (!cancelled) setExpired(true);
          return;
        }
        throw new Error("Could not check this link.");
      }
      const body = (await response.json()) as CaptureInfo;
      if (cancelled) return;
      setInfo(body);
      if (body.status === "completed" || body.status === "failed") return;
      await fetch(`/api/face/capture-sessions/${token}/opened`, {
        method: "POST",
      });
    }
    void open().catch(() => setError("Could not open this link."));
    return () => {
      cancelled = true;
      stopCameraEvent();
    };
  }, [token]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraReady || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      cameraGeneration.current++;
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
      setCameraReady(false);
      setCameraStarting(false);
      setError("The camera could not start.");
    });
  }, [cameraReady]);

  useEffect(() => {
    if (info?.status !== "processing") return;
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      try {
        const response = await fetch(`/api/face/capture-sessions/${token}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error();
        const body = (await response.json()) as CaptureInfo;
        if (cancelled) return;
        setInfo(body);
        if (body.status === "processing") {
          timer = window.setTimeout(poll, 1000);
        }
      } catch {
        if (!cancelled) timer = window.setTimeout(poll, 2000);
      }
    }
    timer = window.setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [info?.status, token]);

  function stopCamera() {
    cameraGeneration.current++;
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
    setCameraReady(false);
    setCameraStarting(false);
  }

  async function startCamera() {
    setError(null);
    setCameraStarting(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStarting(false);
      setError("This browser cannot use the camera.");
      return;
    }
    const generation = ++cameraGeneration.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });
      if (generation !== cameraGeneration.current) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      streamRef.current = stream;
      setCameraReady(true);
    } catch (cameraError) {
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

  async function captureFrame() {
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
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Capture failed"))),
        "image/jpeg",
        0.78,
      ),
    );
  }

  async function completeCapture() {
    if (!streamRef.current?.getVideoTracks()[0] || capturing) return;
    setCapturing(true);
    setError(null);
    try {
      const frames: Blob[] = [];
      for (let index = 0; index < 6; index++) {
        frames.push(await captureFrame());
        if (index < 5) await new Promise((resolve) => setTimeout(resolve, 350));
      }
      stopCamera();
      const form = new FormData();
      frames.forEach((frame, index) => {
        form.append("frames", frame, `phone-capture-${index}.jpg`);
      });
      const response = await fetch("/api/face/scans", {
        method: "POST",
        headers: { "x-face-capture-token": token },
        body: form,
      });
      const body = await response.json();
      if (!response.ok) {
        const message = captureError(body.reason, body.error);
        setInfo((current) =>
          current ? { ...current, status: "failed", error: message } : current,
        );
        throw new Error(message);
      }
      setInfo((current) =>
        current ? { ...current, status: "completed" } : current,
      );
    } catch (captureFailure) {
      setError(
        captureFailure instanceof Error
          ? captureFailure.message
          : "We could not use that scan.",
      );
    } finally {
      setCapturing(false);
    }
  }

  if (expired) {
    return (
      <PageState
        title="This link expired"
        text="Make a new QR code on your computer."
      />
    );
  }

  if (!info) {
    return error ? (
      <PageState title="Could not connect" text={error} action="Try again" />
    ) : (
      <PageState loading title="Opening camera setup" />
    );
  }

  if (info.status === "completed") {
    return <PageState title="Done" text="Go back to your computer." />;
  }

  if (info.status === "failed") {
    return (
      <PageState
        title="That did not work"
        text={
          info.error || "Make a new QR code on your computer and try again."
        }
      />
    );
  }

  if ((capturing && !cameraReady) || info.status === "processing") {
    return <PageState loading title="Checking your face" />;
  }

  return (
    <main className="min-h-dvh bg-zinc-950 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-md flex-col">
        <p className="text-sm font-medium text-zinc-500">Hack Club Photos</p>

        {!cameraReady ? (
          <section className="face-step flex flex-1 flex-col justify-center py-12">
            <p className="text-xs text-zinc-500">Step 1 of 2</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Use your front camera
            </h1>
            <p className="mt-3 text-zinc-400">This takes a few seconds.</p>
            {error ? (
              <p className="mt-5 text-sm text-red-400">{error}</p>
            ) : null}
            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={cameraStarting}
              className="mt-8 min-h-12 w-full rounded-xl bg-red-600 px-6 font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {cameraStarting ? "Opening camera..." : "Open camera"}
            </button>
          </section>
        ) : (
          <section className="face-step flex flex-1 flex-col pt-8">
            <p className="text-xs text-zinc-500">Step 2 of 2</p>
            <h1 className="mt-3 text-2xl font-semibold">Look at the camera</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Keep still for a moment.
            </p>
            <div className="mt-6 min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                muted
                playsInline
                className="h-full min-h-[52dvh] w-full scale-x-[-1] object-cover"
              />
            </div>
            {error ? (
              <p className="mt-3 text-sm text-red-400">{error}</p>
            ) : null}
            <button
              type="button"
              onClick={() => void completeCapture()}
              disabled={capturing}
              className="mt-4 min-h-14 w-full rounded-xl bg-red-600 px-6 font-semibold text-white transition-colors active:bg-red-700"
            >
              {capturing ? "Hold still..." : "Continue"}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

function PageState({
  title,
  text,
  action,
  loading = false,
}: {
  title: string;
  text?: string;
  action?: string;
  loading?: boolean;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-950 p-6 text-center text-white">
      <div className="face-step max-w-sm">
        {loading ? (
          <div className="mb-6 flex justify-center">
            <LoadingSpinner size="xl" />
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold">{title}</h1>
        {text ? <p className="mt-2 text-zinc-400">{text}</p> : null}
        {action ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 min-h-12 rounded-xl bg-zinc-100 px-6 font-semibold text-zinc-950"
          >
            {action}
          </button>
        ) : null}
      </div>
    </main>
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
