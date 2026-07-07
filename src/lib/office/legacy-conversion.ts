export type LegacyOfficeConversion = {
  path: string;
  alreadyExists: boolean;
  label: string;
};

export function isLegacyOfficePath(path: string): boolean {
  return /\.(doc|xls|ppt)$/i.test(path);
}

export async function convertLegacyOfficeFile(path: string): Promise<LegacyOfficeConversion> {
  const response = await fetch("/api/office/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
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
