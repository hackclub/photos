export function useHeicUrl(url: string | null, filename?: string | null) {
  return {
    displayUrl: url,
    isConverting: false,
    conversionError: false,
  };
}
