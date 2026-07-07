export const OFFICE_LARGE_FILE_BYTES = 8 * 1024 * 1024;

export function formatFileSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return "unknown size";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i += 1) {
    value /= 1024;
    unit = units[i];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

export function downloadAsset(assetUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = assetUrl;
  a.download = filename;
  a.click();
}

export async function getAssetSize(assetUrl: string): Promise<number | null> {
  try {
    const head = await fetch(assetUrl, { method: "HEAD" });
    const length = Number(head.headers.get("content-length"));
    if (head.ok && Number.isFinite(length) && length >= 0) return length;
  } catch {
    // Fall through to a one-byte range probe. Some route handlers do not
    // implement HEAD, but the asset endpoint supports byte ranges.
  }

  try {
    const probe = await fetch(assetUrl, { headers: { Range: "bytes=0-0" } });
    const contentRange = probe.headers.get("content-range");
    const match = contentRange?.match(/\/(\d+)$/);
    if (match) {
      const total = Number(match[1]);
      if (Number.isFinite(total) && total >= 0) return total;
    }
    const length = Number(probe.headers.get("content-length"));
    return Number.isFinite(length) && length >= 0 ? length : null;
  } catch {
    return null;
  }
}

export function isZipBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}
