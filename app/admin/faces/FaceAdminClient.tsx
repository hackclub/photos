"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import {
  HiArrowPath,
  HiCheckCircle,
  HiPause,
  HiPlay,
  HiQueueList,
  HiStop,
  HiXMark,
} from "react-icons/hi2";
import {
  cancelFaceJob,
  controlFaceQueue,
  getFaceAdminState,
  processPendingFaceIndexing,
  setEventFaceIndexing,
  synchronizeFaceJobs,
  updateFaceSystemSettings,
} from "@/app/actions/faces-admin";

type State = Awaited<ReturnType<typeof getFaceAdminState>>;

export default function FaceAdminClient() {
  const [state, setState] = useState<State | null>(null);
  const [settings, setSettings] = useState<State["settings"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function refresh(sync = false) {
    try {
      if (sync) await synchronizeFaceJobs();
      const next = await getFaceAdminState();
      setState(next);
      setSettings((current) => current ?? next.settings);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to load queue",
      );
    }
  }
  const refreshOnInterval = useEffectEvent(refresh);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Effect Events stay out of dependency arrays.
  useEffect(() => {
    void refreshOnInterval(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshOnInterval(true);
    }, 3500);
    return () => window.clearInterval(interval);
  }, []);

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
        await refresh(true);
      } catch (actionError) {
        setError(
          actionError instanceof Error ? actionError.message : "Action failed",
        );
      }
    });
  }

  if (!state || !settings) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-zinc-400">
        {error ? (
          <>
            <p className="text-sm text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => void refresh(true)}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white"
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <HiArrowPath className="h-5 w-5 animate-spin" /> Loading face queue
          </>
        )}
      </div>
    );
  }

  const ready = state.events.reduce(
    (sum, event) => sum + (event.scans.ready ?? 0),
    0,
  );
  const total = state.events.reduce((sum, event) => sum + event.imageCount, 0);
  const queued =
    (state.queue.counts.waiting ?? 0) +
    (state.queue.counts.delayed ?? 0) +
    (state.queue.counts.paused ?? 0);

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Indexed photos" value={`${ready}/${total}`} />
        <Stat label="Queued" value={queued.toLocaleString()} />
        <Stat
          label="Active"
          value={(state.queue.counts.active ?? 0).toString()}
        />
        <Stat
          label="Queue"
          value={state.queue.paused ? "Paused" : "Running"}
          tone={state.queue.paused ? "amber" : "green"}
        />
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="flex flex-col gap-3 border-b border-zinc-800 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-bold text-white">Queue controls</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Pause stops the next job. Stop cancels queued work and discards
              active results.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => processPendingFaceIndexing())}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
            >
              <HiQueueList className="h-4 w-4" /> Process pending
            </button>
            <button
              type="button"
              disabled={isPending || state.queue.paused}
              onClick={() => run(() => controlFaceQueue("pause"))}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              <HiPause className="h-4 w-4" /> Pause
            </button>
            <button
              type="button"
              disabled={isPending || !state.queue.paused}
              onClick={() => run(() => controlFaceQueue("resume"))}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              <HiPlay className="h-4 w-4" /> Resume
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => controlFaceQueue("stop"))}
              className="inline-flex items-center gap-2 rounded-xl border border-red-900 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-300 disabled:opacity-40"
            >
              <HiStop className="h-4 w-4" /> Stop all
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-5">
          <h2 className="font-bold text-white">Defaults</h2>
          <p className="mt-1 text-sm text-zinc-400">
            These settings apply when a new event index is created.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Toggle
            label="Scan new uploads"
            description="Queue image uploads when face indexing is enabled."
            checked={settings.scanNewUploads}
            onChange={(scanNewUploads) =>
              setSettings({ ...settings, scanNewUploads })
            }
          />
          <Toggle
            label="Automatic suggestions"
            description="Suggest matches for opted-in event participants."
            checked={settings.autoSuggestions}
            onChange={(autoSuggestions) =>
              setSettings({ ...settings, autoSuggestions })
            }
          />
          <label className="space-y-2 text-sm text-zinc-300">
            <span className="font-medium">Algorithm</span>
            <select
              value={settings.algorithm}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  algorithm: event.target.value as typeof settings.algorithm,
                })
              }
              className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-white"
            >
              <option value="fast">Fast</option>
              <option value="accurate">Accurate</option>
              <option value="very-accurate">Very accurate</option>
            </select>
          </label>
          <NumberField
            label="Maximum faces per photo"
            value={settings.maxFaces}
            min={1}
            max={500}
            step={1}
            onChange={(maxFaces) => setSettings({ ...settings, maxFaces })}
          />
          <NumberField
            label="Suggestion confidence"
            value={settings.suggestionThreshold}
            min={0}
            max={1}
            step={0.01}
            onChange={(suggestionThreshold) =>
              setSettings({ ...settings, suggestionThreshold })
            }
          />
          <NumberField
            label="Blur confidence"
            value={settings.blurThreshold}
            min={0}
            max={1}
            step={0.01}
            onChange={(blurThreshold) =>
              setSettings({ ...settings, blurThreshold })
            }
          />
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => updateFaceSystemSettings(settings))}
          className="mt-5 rounded-xl bg-zinc-100 px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-white disabled:opacity-50"
        >
          Save settings
        </button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 p-5">
          <h2 className="font-bold text-white">Events</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Enable an event or process only its missing photos.
          </p>
        </div>
        <div className="max-h-[520px] divide-y divide-zinc-800 overflow-y-auto">
          {state.events.map((event) => {
            const indexed = event.scans.ready ?? 0;
            return (
              <div
                key={event.id}
                className="grid gap-3 p-4 md:grid-cols-[1fr_180px_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">
                    {event.name}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {indexed}/{event.imageCount} indexed · {event.status}
                  </p>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-red-500 transition-all"
                    style={{
                      width: `${event.imageCount ? (indexed / event.imageCount) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(() => setEventFaceIndexing(event.id, !event.enabled))
                    }
                    className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200"
                  >
                    {event.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(() => processPendingFaceIndexing(event.id))
                    }
                    className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white"
                  >
                    Process
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 p-5">
          <h2 className="font-bold text-white">Recent queue</h2>
        </div>
        <div className="divide-y divide-zinc-800">
          {state.queue.jobs.length === 0 ? (
            <p className="p-5 text-sm text-zinc-500">No recent jobs.</p>
          ) : (
            state.queue.jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {job.type} <span className="text-zinc-600">#{job.id}</span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {job.state} · {new Date(job.createdAt).toLocaleString()}
                    {job.failedReason ? ` · ${job.failedReason}` : ""}
                  </p>
                </div>
                {["active", "waiting", "delayed", "paused"].includes(
                  job.state,
                ) && job.id ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => cancelFaceJob(job.id!))}
                    className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400"
                    aria-label="Cancel job"
                  >
                    <HiXMark className="h-5 w-5" />
                  </button>
                ) : job.state === "completed" ? (
                  <HiCheckCircle className="h-5 w-5 text-green-500" />
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "amber";
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-bold ${
          tone === "green"
            ? "text-green-400"
            : tone === "amber"
              ? "text-amber-400"
              : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="mt-1 block text-xs text-zinc-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-red-600"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2 text-sm text-zinc-300">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-white"
      />
    </label>
  );
}
