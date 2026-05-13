type LogLevel = "error" | "warn" | "info";

function write(level: LogLevel, args: unknown[]) {
  const target = globalThis.console;
  target[level](...args);
}

export const logger = {
  error: (...args: unknown[]) => write("error", args),
  warn: (...args: unknown[]) => write("warn", args),
  info: (...args: unknown[]) => write("info", args),
};
