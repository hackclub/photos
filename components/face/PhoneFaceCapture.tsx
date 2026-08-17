"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  HiArrowPath,
  HiCamera,
  HiCheckCircle,
  HiShieldCheck,
} from "react-icons/hi2";

type CaptureInfo = {
  status: "created" | "opened" | "processing" | "completed" | "failed";
  eventName: string;
  mode: "filter" | "blur";
  error?: string;
};

export default function PhoneFaceCapture({ token }: { token: string }) {
  const [info, setInfo] = useState<CaptureInfo | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraGeneration = useRef(0);
  const stopCameraOnUnmount = useEffectEvent(stopCamera);

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
        throw new Error("Could not check this capture link.");
      }
      const body = (await response.json()) as CaptureInfo;
      if (cancelled) return;
      setInfo(body);
      if (body.status === "completed") return;
      await fetch(`/api/face/capture-sessions/${token}/opened`, {
        method: "POST",
      });
    }
    void open().catch(() => setError("Could not open this capture link."));
    return () => {
      cancelled = true;
      stopCameraOnUnmount();
    };
  }, [token]);

  function stopCamera() {
    cameraGeneration.current++;
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
    setCameraReady(false);
  }

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "This browser cannot access a camera. Open the link in Safari or Chrome.",
      );
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
          ? "Camera permission was denied. Allow camera access and try again."
          : "The camera could not start. Close other camera apps and try again.",
      );
    }
  }

  async function captureFrame(track: MediaStreamTrack) {
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
      frames.forEach((frame, index) => {
        form.append("frames", frame, `phone-capture-${index}.jpg`);
      });
      const response = await fetch("/api/face/scans", {
        method: "POST",
        headers: { "x-face-capture-token": token },
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Face scan failed");
      setInfo((current) =>
        current ? { ...current, status: "completed" } : current,
      );
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : "Face scan failed",
      );
    } finally {
      setCapturing(false);
    }
  }

  if (expired) {
    return (
      <Shell>
        <HiShieldCheck className="h-10 w-10 text-zinc-500" />
        <h1 className="mt-5 text-2xl font-bold text-white">Link expired</h1>
        <p className="mt-2 text-zinc-400">
          Create a new QR code on your computer.
        </p>
      </Shell>
    );
  }

  if (!info) {
    return (
      <Shell>
        {error ? (
          <>
            <HiShieldCheck className="h-10 w-10 text-zinc-500" />
            <h1 className="mt-5 text-2xl font-bold text-white">
              Could not connect
            </h1>
            <p className="mt-2 text-zinc-400">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 min-h-12 rounded-xl bg-zinc-800 px-5 font-bold text-white"
            >
              Try again
            </button>
          </>
        ) : (
          <HiArrowPath className="h-8 w-8 animate-spin text-zinc-500" />
        )}
      </Shell>
    );
  }

  if (info.status === "completed") {
    return (
      <Shell>
        <HiCheckCircle className="h-12 w-12 text-emerald-400" />
        <h1 className="mt-5 text-2xl font-bold text-white">You're all set</h1>
        <p className="mt-2 max-w-sm text-zinc-400">
          Your computer has the scan now. You can close this page.
        </p>
      </Shell>
    );
  }

  return (
    <main className="min-h-dvh bg-zinc-950 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-lg flex-col">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-400">
          <HiShieldCheck className="h-5 w-5 text-red-400" /> Hack Club Photos
        </div>
        <div className="relative flex-1 overflow-hidden rounded-[2rem] border border-zinc-800 bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            className="h-full min-h-[58dvh] w-full scale-x-[-1] object-cover"
          />
          {!cameraReady ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
              <HiCamera className="h-10 w-10 text-zinc-500" />
              <h1 className="mt-5 text-2xl font-bold">
                Complete your face scan
              </h1>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {info.eventName ? `For ${info.eventName}. ` : ""}Camera frames
                are sent for a temporary liveness check and are not stored.
              </p>
              <button
                type="button"
                onClick={startCamera}
                className="mt-7 min-h-12 w-full rounded-2xl bg-red-600 px-6 py-3 font-bold text-white active:bg-red-500"
              >
                Open front camera
              </button>
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-72 w-56 rounded-[48%] border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />
            </div>
          )}
        </div>
        {error ? (
          <p className="mt-3 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        {cameraReady ? (
          <button
            type="button"
            onClick={completeCapture}
            disabled={capturing}
            className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 font-bold text-white disabled:bg-zinc-700"
          >
            {capturing ? (
              <HiArrowPath className="h-5 w-5 animate-spin" />
            ) : (
              <HiCamera className="h-5 w-5" />
            )}
            {capturing ? "Checking your scan..." : "Take face scan"}
          </button>
        ) : null}
      </div>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 p-6 text-center text-white">
      {children}
    </main>
  );
}
