import { slugifyPageName } from "@/lib/markdown/wiki-links";

function decodeLinkTarget(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

/**
 * Convert a markdown page link target to Cabinet's tree path shape.
 *
 * Cabinet stores directory pages as `folder/index.md` on disk but exposes them
 * in the tree as `folder`, so links such as `folder/index.md` must resolve to
 * `folder` before matching against tree nodes.
 */
export function normalizeMarkdownPageTarget(target: string): string {
  let value = decodeLinkTarget(target.trim()).replace(/\\/g, "/");

  const hashIndex = value.indexOf("#");
  if (hashIndex >= 0) value = value.slice(0, hashIndex);

  const queryIndex = value.indexOf("?");
  if (queryIndex >= 0) value = value.slice(0, queryIndex);

  while (value.startsWith("./")) value = value.slice(2);
  value = value.replace(/^\/+/, "").replace(/\/+$/, "");

  const parts: string[] = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  const last = parts.at(-1)?.toLowerCase();
  if (last === "index.md" || last === "index") {
    parts.pop();
  }

  let normalized = parts.join("/");
  if (normalized.toLowerCase().endsWith(".md")) {
    normalized = normalized.slice(0, -".md".length);
  }
  return normalized;
}

export function markdownPageTargetCandidates(
  target: string,
  currentPath: string | null
): string[] {
  const normalized = normalizeMarkdownPageTarget(target);
  const candidates = new Set<string>();
  candidates.add(normalized);

  const rawTarget = decodeLinkTarget(target.trim());
  if (currentPath && normalized && !rawTarget.startsWith("/")) {
    const parentDir = currentPath.includes("/")
      ? currentPath.slice(0, currentPath.lastIndexOf("/"))
      : "";
    if (parentDir) candidates.add(`${parentDir}/${normalized}`);

    // A Cabinet folder page is represented by `folder/index.md` on disk but by
    // `folder` in the tree. Relative links from that page should be allowed to
    // resolve under the folder as well.
    candidates.add(`${currentPath}/${normalized}`);
  }

  return [...candidates];
}

export function markdownPageTargetSlug(target: string): string {
  const normalized = normalizeMarkdownPageTarget(target);
  const lastSegment = normalized.split("/").filter(Boolean).pop();
  return slugifyPageName(lastSegment ?? decodeLinkTarget(target.trim()));
}

export function isPathLikeWikiTarget(target: string): boolean {
  const value = target.trim();
  return /[\\/]/.test(value) || /\.md(?:[#?].*)?$/i.test(value);
}

export function wikiLinkHrefForPageName(pageName: string): string {
  return isPathLikeWikiTarget(pageName)
    ? `#page-path:${encodeURIComponent(pageName)}`
    : `#page:${slugifyPageName(pageName)}`;
}
