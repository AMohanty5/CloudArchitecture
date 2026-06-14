/** Trigger a browser download for a data URL (e.g. a PNG from html-to-image). */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/** Trigger a browser download for a Blob (e.g. an SVG fetched from the API). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A filesystem-safe slug for a diagram filename. */
export function safeFilename(name: string, ext: string): string {
  const base = name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'architecture';
  return `${base}.${ext}`;
}
