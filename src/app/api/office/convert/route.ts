import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveContentPath } from "@/lib/storage/path-utils";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";

const CONVERT_TIMEOUT_MS = 90_000;
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

type OfficeKind = "word" | "spreadsheet" | "presentation";
type OfficeArchiveBucket = "doc" | "xls" | "ppt";

const CONVERT_TARGETS: Record<
  OfficeKind,
  { format: string; ext: string; legacyExt: string; label: string }
> = {
  word: { format: "docx", ext: ".docx", legacyExt: ".doc", label: "Word" },
  spreadsheet: { format: "xlsx", ext: ".xlsx", legacyExt: ".xls", label: "Excel" },
  presentation: { format: "pptx", ext: ".pptx", legacyExt: ".ppt", label: "PowerPoint" },
};

const KIND_BY_LEGACY_EXT: Record<string, OfficeKind> = {
  ".doc": "word",
  ".xls": "spreadsheet",
  ".ppt": "presentation",
};

const ARCHIVE_BUCKET_BY_KIND: Record<OfficeKind, OfficeArchiveBucket> = {
  word: "doc",
  spreadsheet: "xls",
  presentation: "ppt",
};

function libreOfficeCommand(): string {
  return process.platform === "win32" ? "soffice.exe" : "soffice";
}

async function isOleCompoundFile(filePath: string): Promise<boolean> {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(OLE_MAGIC.length);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead === OLE_MAGIC.length && buffer.equals(OLE_MAGIC);
  } finally {
    await handle.close();
  }
}

function runLibreOfficeConvert(
  inputPath: string,
  outputDir: string,
  format: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      libreOfficeCommand(),
      [
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--convert-to",
        format,
        "--outdir",
        outputDir,
        inputPath,
      ],
      { windowsHide: true }
    );

    let stderr = "";
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Office conversion timed out"));
    }, CONVERT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `LibreOffice exited with code ${code}`));
    });
  });
}

function parseOfficeKind(value: unknown, sourceExt: string): OfficeKind | null {
  if (value === "word" || value === "spreadsheet" || value === "presentation") {
    return value;
  }
  return KIND_BY_LEGACY_EXT[sourceExt] ?? null;
}

function convertedVirtualPath(virtualPath: string, targetExt: string): string {
  const ext = path.posix.extname(virtualPath);
  if (ext.toLowerCase() === targetExt) {
    return `${virtualPath.slice(0, -ext.length)}.converted${targetExt}`;
  }
  if (ext) {
    return `${virtualPath.slice(0, -ext.length)}${targetExt}`;
  }
  return `${virtualPath}${targetExt}`;
}

function convertedFsPath(sourcePath: string, targetExt: string): string {
  const ext = path.extname(sourcePath);
  if (ext.toLowerCase() === targetExt) {
    return `${sourcePath.slice(0, -ext.length)}.converted${targetExt}`;
  }
  if (ext) {
    return `${sourcePath.slice(0, -ext.length)}${targetExt}`;
  }
  return `${sourcePath}${targetExt}`;
}

function splitVirtualPath(virtualPath: string): string[] {
  return virtualPath.split("/").filter(Boolean);
}

function isArchivedOriginalVirtualPath(virtualPath: string): boolean {
  return splitVirtualPath(virtualPath).includes(".office-originals");
}

function archivedOriginalVirtualPath(virtualPath: string, kind: OfficeKind): string {
  const parts = splitVirtualPath(virtualPath);
  const cabinetRoot = parts.length > 1 ? parts[0] : "";
  const relativeParts = parts.length > 1 ? parts.slice(1) : parts;
  const fileName = relativeParts.at(-1);
  if (!fileName) {
    throw new Error("Source path does not include a file name");
  }
  return [
    cabinetRoot,
    ".office-originals",
    ARCHIVE_BUCKET_BY_KIND[kind],
    ...relativeParts.slice(0, -1),
    fileName,
  ]
    .filter(Boolean)
    .join("/");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function uniqueArchivedPath(archivePath: string): Promise<string> {
  if (!(await pathExists(archivePath))) {
    return archivePath;
  }

  const dir = path.dirname(archivePath);
  const ext = path.extname(archivePath);
  const base = path.basename(archivePath, ext);
  for (let i = 1; i < 10_000; i += 1) {
    const candidate = path.join(dir, `${base}.${i}${ext}`);
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }
  throw new Error("Unable to allocate archive path for original Office file");
}

async function archiveOriginalFile(sourcePath: string, virtualPath: string, kind: OfficeKind) {
  if (isArchivedOriginalVirtualPath(virtualPath)) {
    throw new Error("Archived Office originals cannot be archived again");
  }

  const archiveVirtualPath = archivedOriginalVirtualPath(virtualPath, kind);
  const archivePath = await uniqueArchivedPath(resolveContentPath(archiveVirtualPath));
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.rename(sourcePath, archivePath);
  return archivePath;
}

async function restoreArchivedOriginal(archivePath: string, sourcePath: string): Promise<void> {
  if (await pathExists(sourcePath)) {
    return;
  }
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.rename(archivePath, sourcePath);
}

async function writeConvertedFileAtomically(
  tempOutputPath: string,
  targetPath: string,
  sourcePath: string,
  virtualPath: string,
  kind: OfficeKind
): Promise<void> {
  const tempTargetPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.cabinet-converting-${process.pid}-${Date.now()}`
  );
  let archivePath: string | null = null;

  await fs.copyFile(tempOutputPath, tempTargetPath);
  try {
    archivePath = await archiveOriginalFile(sourcePath, virtualPath, kind);
    await fs.rename(tempTargetPath, targetPath);
  } catch (error) {
    await fs.rm(tempTargetPath, { force: true }).catch(() => undefined);
    if (archivePath) {
      await restoreArchivedOriginal(archivePath, sourcePath).catch(() => undefined);
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { path?: unknown; kind?: unknown };
    const virtualPath = typeof body.path === "string" ? body.path : "";
    if (!virtualPath || virtualPath.startsWith("gdrive:")) {
      return NextResponse.json(
        { error: "Only local Cabinet files can be converted in place" },
        { status: 400 }
      );
    }

    const sourceExt = path.extname(virtualPath).toLowerCase();
    const kind = parseOfficeKind(body.kind, sourceExt);
    if (!kind) {
      return NextResponse.json({ error: "Unsupported Office conversion type" }, { status: 400 });
    }
    const target = CONVERT_TARGETS[kind];

    const sourcePath = resolveContentPath(virtualPath);
    const targetPath = convertedFsPath(sourcePath, target.ext);
    const targetVirtualPath = convertedVirtualPath(virtualPath, target.ext);
    const targetExists = await fileExists(targetPath);

    let sourceStat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      sourceStat = await fs.stat(sourcePath);
    } catch {
      if (targetExists) {
        return NextResponse.json({
          path: targetVirtualPath,
          alreadyExists: true,
          label: target.label,
        });
      }
      return NextResponse.json({ error: "Source file was not found" }, { status: 404 });
    }

    if (!sourceStat.isFile()) {
      return NextResponse.json({ error: "Source is not a file" }, { status: 400 });
    }
    if (!(await isOleCompoundFile(sourcePath))) {
      return NextResponse.json(
        { error: "Source is not a legacy binary Office file" },
        { status: 400 }
      );
    }
    if (targetExists) {
      if (isArchivedOriginalVirtualPath(virtualPath)) {
        return NextResponse.json({
          path: targetVirtualPath,
          alreadyExists: true,
          label: target.label,
        });
      }
      await archiveOriginalFile(sourcePath, virtualPath, kind);
      invalidateTreeCache();
      return NextResponse.json({
        path: targetVirtualPath,
        alreadyExists: true,
        label: target.label,
      });
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-office-"));
    try {
      const tempInputPath = path.join(tempDir, `source${target.legacyExt}`);
      const tempOutputPath = path.join(tempDir, `source${target.ext}`);
      await fs.copyFile(sourcePath, tempInputPath);
      await runLibreOfficeConvert(tempInputPath, tempDir, target.format);
      const tempOutputStat = await fs.stat(tempOutputPath);
      if (!tempOutputStat.isFile()) {
        return NextResponse.json({ error: "Converted file was not created" }, { status: 500 });
      }
      await writeConvertedFileAtomically(tempOutputPath, targetPath, sourcePath, virtualPath, kind);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }

    const convertedStat = await fs.stat(targetPath);
    if (!convertedStat.isFile()) {
      return NextResponse.json({ error: "Converted file was not created" }, { status: 500 });
    }

    invalidateTreeCache();
    return NextResponse.json({
      path: targetVirtualPath,
      alreadyExists: false,
      label: target.label,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
