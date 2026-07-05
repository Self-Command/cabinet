const MAX_USER_PATH_SEGMENT_LENGTH = 120;

function normalizeInput(value: string): string {
  return value.normalize("NFC").trim();
}

function clampSegment(value: string): string {
  const chars = Array.from(value);
  if (chars.length <= MAX_USER_PATH_SEGMENT_LENGTH) return value;
  return chars
    .slice(0, MAX_USER_PATH_SEGMENT_LENGTH)
    .join("")
    .replace(/[. _-]+$/g, "");
}

/**
 * Slug for user-visible page, folder, and cabinet path segments.
 * Keeps Unicode letters/numbers so names like "生活领域" remain addressable.
 */
export function slugifyUserPathSegment(name: string): string {
  const slug = normalizeInput(name)
    .toLowerCase()
    .replace(/[/\\]+/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return clampSegment(slug);
}

export interface SanitizeUserFileBaseNameOptions {
  preserveSpaces?: boolean;
}

/**
 * File basename sanitizer for user-created/imported flat files.
 * Preserves existing ASCII-friendly behavior while allowing Unicode names.
 */
export function sanitizeUserFileBaseName(
  name: string,
  options: SanitizeUserFileBaseNameOptions = {}
): string {
  const preserveSpaces = options.preserveSpaces ?? true;
  let base = normalizeInput(name)
    .replace(/[/\\]+/g, "-")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[^\p{L}\p{N}._ -]+/gu, "-")
    .trim();

  base = preserveSpaces
    ? base.replace(/\s+/g, " ")
    : base.replace(/\s+/g, "-");
  base = base
    .replace(/-+/g, "-")
    .replace(/^[. _-]+|[. _-]+$/g, "");

  if (!base || base === "." || base === "..") return "";
  return clampSegment(base);
}

export function sanitizeUserFileExtension(ext: string, fallback = ""): string {
  let cleaned = normalizeInput(ext).toLowerCase();
  if (!cleaned) return fallback;
  if (!cleaned.startsWith(".")) cleaned = `.${cleaned}`;
  cleaned = cleaned.replace(/[^a-z0-9.]/g, "").replace(/\.{2,}/g, ".");
  if (!cleaned || cleaned === ".") return fallback;
  return cleaned.slice(0, 32);
}
