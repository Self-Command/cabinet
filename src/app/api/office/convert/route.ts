import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveContentPath } from "@/lib/storage/path-utils";

const CONVERT_TIMEOUT_MS = 90_000;
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const CONVERT_TARGETS: Record<string, { format: string; ext: string; label: string }> = {
  ".doc": { format: "docx", ext: ".docx", label: "Word" },
  ".xls": { format: "xlsx", ext: ".xlsx", label: "Excel" },
  ".ppt": { format: "pptx", ext: ".pptx", label: "PowerPoint" },
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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { path?: unknown };
    const virtualPath = typeof body.path === "string" ? body.path : "";
    if (!virtualPath || virtualPath.startsWith("gdrive:")) {
      return NextResponse.json(
        { error: "Only local Cabinet files can be converted in place" },
        { status: 400 }
      );
    }

    const sourceExt = path.extname(virtualPath).toLowerCase();
    const target = CONVERT_TARGETS[sourceExt];
    if (!target) {
      return NextResponse.json({ error: "Unsupported Office conversion type" }, { status: 400 });
    }

    const sourcePath = resolveContentPath(virtualPath);
    const targetPath = sourcePath.slice(0, -sourceExt.length) + target.ext;
    const targetVirtualPath = virtualPath.slice(0, -sourceExt.length) + target.ext;

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

    await runLibreOfficeConvert(sourcePath, path.dirname(sourcePath), target.format);

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
