import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveContentPath } from "@/lib/storage/path-utils";

const CONVERT_TIMEOUT_MS = 90_000;
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

type OfficeKind = "word" | "spreadsheet" | "presentation";

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

    try {
      const existing = await fs.stat(targetPath);
      if (existing.isFile()) {
        return NextResponse.json({
          path: targetVirtualPath,
          alreadyExists: true,
          label: target.label,
        });
      }
    } catch {
      // Convert below.
    }

    const sourceStat = await fs.stat(sourcePath);
    if (!sourceStat.isFile()) {
      return NextResponse.json({ error: "Source is not a file" }, { status: 400 });
    }
    if (!(await isOleCompoundFile(sourcePath))) {
      return NextResponse.json(
        { error: "Source is not a legacy binary Office file" },
        { status: 400 }
      );
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
      await fs.copyFile(tempOutputPath, targetPath);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }

    const convertedStat = await fs.stat(targetPath);
    if (!convertedStat.isFile()) {
      return NextResponse.json({ error: "Converted file was not created" }, { status: 500 });
    }

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
