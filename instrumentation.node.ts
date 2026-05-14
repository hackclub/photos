export {};

declare global {
  // eslint-disable-next-line no-var
  var __hackClubPhotosOtelStarted: unknown;
}

if (!globalThis.__hackClubPhotosOtelStarted) {
  await import("./otel-bootstrap.cjs");
}
