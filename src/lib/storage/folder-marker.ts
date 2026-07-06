import path from "path";
import fs from "fs/promises";
import matter from "gray-matter";
import type { FrontMatter } from "@/types";
import { ensureDirectory, fileExists, writeFileContent } from "./fs-operations";
import { resolveContentPath } from "./path-utils";

export const FOLDER_MARKER_FILE = ".cabinet-folder";

export async function writeFolderMarkerFile(dirPath: string): Promise<void> {
  await writeFileContent(path.join(dirPath, FOLDER_MARKER_FILE), "");
}

function folderTitleFromPath(virtualPath: string): string {
  return virtualPath.split("/").filter(Boolean).at(-1) || "Folder";
}

function folderFrontmatter(title: string): FrontMatter {
  const now = new Date().toISOString();
  return { title, created: now, modified: now, tags: [] };
}

/**
 * Mark an already-created directory as an explicit Cabinet folder.
 * Returns false when the target does not exist as a directory; callers should
 * not fabricate folders solely from an agent metadata line.
 */
export async function ensureExplicitFolder(virtualPath: string): Promise<boolean> {
  const dirPath = resolveContentPath(virtualPath);
  const stat = await fs.stat(dirPath).catch(() => null);
  if (!stat?.isDirectory()) return false;

  const indexPath = path.join(dirPath, "index.md");
  if (!(await fileExists(indexPath))) {
    const title = folderTitleFromPath(virtualPath);
    await ensureDirectory(dirPath);
    await writeFileContent(
      indexPath,
      matter.stringify(`\n# ${title}\n`, folderFrontmatter(title))
    );
  }

  const markerPath = path.join(dirPath, FOLDER_MARKER_FILE);
  if (!(await fileExists(markerPath))) {
    await writeFolderMarkerFile(dirPath);
  }
  return true;
}
