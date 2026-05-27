const FALLBACK_FILENAME = "download";

export function safeFilename(filename: string | null | undefined): string {
  const cleaned = (filename ?? "")
    .replace(/[\\/]/g, "_")
    .replaceAll(/./g, (char) =>
      char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? "_" : char,
    )
    .replace(/^\.+/, "_")
    .replace(/[\r\n"]/g, "_")
    .trim();

  return cleaned || FALLBACK_FILENAME;
}

export function contentDispositionFilename(filename: string): string {
  return safeFilename(filename).replace(/[%;]/g, "_");
}
