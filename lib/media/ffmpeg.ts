export const MEDIA_PROCESS_TIMEOUT_MS = 45_000;

type FfmpegCommand = {
  once: (event: "end" | "error", listener: (error?: Error) => void) => unknown;
  removeListener: (
    event: "end" | "error",
    listener: (error?: Error) => void,
  ) => unknown;
  kill: (signal: string) => unknown;
};

export function runFfmpegCommand(
  command: FfmpegCommand,
  start: () => void,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeoutMs = options.timeoutMs ?? MEDIA_PROCESS_TIMEOUT_MS;

    const cleanup = () => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
      command.removeListener("end", onEnd);
      command.removeListener("error", onError);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const kill = (error: Error) => {
      try {
        command.kill("SIGKILL");
      } catch {}
      finish(error);
    };
    const onEnd = () => finish();
    const onError = (error?: Error) =>
      finish(error ?? new Error("FFmpeg failed"));
    const onAbort = () => kill(new Error("Media processing aborted"));
    const timeout = setTimeout(
      () => kill(new Error(`Media processing timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );

    command.once("end", onEnd);
    command.once("error", onError);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    try {
      start();
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
