import {
  fetchAssetArrayBuffer,
  isOleCompoundBuffer,
  isZipBuffer,
  type OfficeDownloadProgress,
} from "@/lib/office/browser-file";

export type OfficeKind = "word" | "spreadsheet" | "presentation";

export type LegacyOfficeConversion = {
  path: string;
  alreadyExists: boolean;
  label: string;
};

export type BrowserOfficeLoadResult =
  | { type: "buffer"; buffer: ArrayBuffer }
  | { type: "converted"; path: string };

const OFFICE_KIND_LABELS: Record<OfficeKind, string> = {
  word: "Word",
  spreadsheet: "Excel",
  presentation: "PowerPoint",
};

const OFFICE_KIND_NOUNS: Record<OfficeKind, string> = {
  word: "document",
  spreadsheet: "spreadsheet",
  presentation: "presentation",
};

export function officeKindLabel(kind: OfficeKind): string {
  return OFFICE_KIND_LABELS[kind];
}

export function officeKindNoun(kind: OfficeKind): string {
  return OFFICE_KIND_NOUNS[kind];
}

export async function convertLegacyOfficeFile(
  path: string,
  kind: OfficeKind
): Promise<LegacyOfficeConversion> {
  const response = await fetch("/api/office/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, kind }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    path?: unknown;
    alreadyExists?: unknown;
    label?: unknown;
    error?: unknown;
  };
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : "Office conversion failed"
    );
  }
  if (typeof payload.path !== "string") {
    throw new Error("Office conversion did not return a converted path");
  }
  return {
    path: payload.path,
    alreadyExists: Boolean(payload.alreadyExists),
    label: typeof payload.label === "string" ? payload.label : "Office",
  };
}

export async function loadBrowserOfficeBuffer({
  path,
  kind,
  assetUrl,
  onProgress,
  onConvertStart,
}: {
  path: string;
  kind: OfficeKind;
  assetUrl: string;
  onProgress?: (progress: OfficeDownloadProgress) => void;
  onConvertStart?: () => void;
}): Promise<BrowserOfficeLoadResult> {
  const buffer = await fetchAssetArrayBuffer(assetUrl, onProgress);
  if (isOleCompoundBuffer(buffer)) {
    onConvertStart?.();
    const converted = await convertLegacyOfficeFile(path, kind);
    return { type: "converted", path: converted.path };
  }
  if (!isZipBuffer(buffer)) {
    throw new Error(`This file is not a supported ${officeKindNoun(kind)}`);
  }
  return { type: "buffer", buffer };
}
