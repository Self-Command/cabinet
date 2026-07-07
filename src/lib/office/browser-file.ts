export const OFFICE_LARGE_FILE_BYTES = 8 * 1024 * 1024;

export type OfficeDownloadProgress = {
  loaded: number;
  total: number | null;
  percent: number | null;
};

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

export async function fetchAssetArrayBuffer(
  assetUrl: string,
  onProgress?: (progress: OfficeDownloadProgress) => void
): Promise<ArrayBuffer> {
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`Failed to load file (${response.status})`);

  const totalHeader = Number(response.headers.get("content-length"));
  const total = Number.isFinite(totalHeader) && totalHeader >= 0 ? totalHeader : null;
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress?.({
      loaded: buffer.byteLength,
      total,
      percent: total ? 100 : null,
    });
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({
      loaded,
      total,
      percent: total ? Math.min(100, Math.round((loaded / total) * 100)) : null,
    });
  }

  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress?.({ loaded, total, percent: total ? 100 : null });
  return result.buffer;
}

export async function fetchAssetFile(
  assetUrl: string,
  filename: string,
  type: string,
  onProgress?: (progress: OfficeDownloadProgress) => void
): Promise<File> {
  const buffer = await fetchAssetArrayBuffer(assetUrl, onProgress);
  return new File([buffer], filename, { type });
}

export function isZipBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function isOleCompoundBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8));
  return (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  );
}
