"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { XlsxViewer } from "./xlsx-viewer";
import { OfficeChrome } from "./office-chrome";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { Button } from "@/components/ui/button";
import { assetUrlFor } from "@/lib/cabinets/asset-url";
import {
  downloadAsset,
  formatFileSize,
  getAssetSize,
  OFFICE_LARGE_FILE_BYTES,
} from "@/lib/office/browser-file";
import { xlsxWorkbookToUniverData } from "@/lib/office/xlsx-to-univer";

type UniverHandle = {
  dispose?: () => void;
};

type PreviewStatus = "checking" | "prompt" | "loading" | "ready" | "legacy";

type UniverModules = [
  typeof import("@univerjs/presets"),
  typeof import("@univerjs/preset-sheets-core"),
  unknown,
  typeof import("xlsx"),
];

interface Props {
  path: string;
  title: string;
}

let univerModulesPromise: Promise<UniverModules> | null = null;

function loadUniverModules(): Promise<UniverModules> {
  univerModulesPromise ??= Promise.all([
    import("@univerjs/presets"),
    import("@univerjs/preset-sheets-core"),
    import("@univerjs/preset-sheets-core/locales/en-US"),
    import("xlsx"),
  ]);
  return univerModulesPromise;
}

async function loadUniverSheet(
  container: HTMLElement,
  buffer: ArrayBuffer,
  filename: string,
  onStage: (stage: string) => void
): Promise<UniverHandle> {
  onStage("Loading spreadsheet engine...");
  const [presets, sheetsPreset, sheetsLocale, XLSX] = await loadUniverModules();

  onStage("Parsing workbook in your browser...");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, cellStyles: true });
  const locale = presets.LocaleType.EN_US;
  const workbookData = {
    ...xlsxWorkbookToUniverData(XLSX, workbook, filename),
    locale,
  };
  const sheetsLocaleData = (
    (sheetsLocale as { default?: unknown }).default ?? sheetsLocale
  ) as Parameters<typeof presets.mergeLocales>[0];

  onStage("Mounting interactive grid...");
  const { univer, univerAPI } = presets.createUniver({
    locale,
    locales: {
      [locale]: presets.mergeLocales(sheetsLocaleData),
    },
    presets: [
      sheetsPreset.UniverSheetsCorePreset({
        container,
        header: false,
        toolbar: false,
        footer: false,
      }),
    ],
  });

  univerAPI.createWorkbook(workbookData);
  return univer as UniverHandle;
}

function SpreadsheetSkeleton({ stage }: { stage: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background/95">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{stage}</span>
      </div>
      <div className="grid flex-1 grid-cols-[48px_repeat(6,minmax(72px,1fr))] grid-rows-[28px_repeat(14,32px)] overflow-hidden p-4">
        {Array.from({ length: 105 }).map((_, index) => (
          <div
            key={index}
            className="border-b border-r border-border/60 bg-muted/20"
          />
        ))}
      </div>
    </div>
  );
}

function LargeFilePrompt({
  path,
  title,
  assetUrl,
  filename,
  fileSize,
  onForceOpen,
  onLegacyOpen,
}: {
  path: string;
  title: string;
  assetUrl: string;
  filename: string;
  fileSize: number | null;
  onForceOpen: () => void;
  onLegacyOpen: () => void;
}) {
  return (
    <ViewerLayout toolbar={<OfficeChrome path={path} title={title} extLabel="XLSX" />}>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-5 text-center shadow-sm">
          <FileSpreadsheet className="mx-auto h-8 w-8 text-primary" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Large spreadsheet</h2>
            <p className="text-xs leading-5 text-muted-foreground">
              This file is {formatFileSize(fileSize)}. Opening it with Univer may take a
              while and can use a lot of browser memory.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadAsset(assetUrl, filename)}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onLegacyOpen}>
              Cabinet preview
            </Button>
            <Button type="button" size="sm" onClick={onForceOpen}>
              Force open
            </Button>
          </div>
        </div>
      </div>
    </ViewerLayout>
  );
}

export function UniverXlsxViewer({ path, title }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const univerRef = useRef<UniverHandle | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("checking");
  const [stage, setStage] = useState("Checking file size...");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const assetUrl = useMemo(() => assetUrlFor(path), [path]);
  const filename = path.split("/").pop() || title || "Spreadsheet";

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    univerRef.current?.dispose?.();
    univerRef.current = null;
    setStatus("checking");
    setStage("Checking file size...");

    void (async () => {
      try {
        const size = await getAssetSize(assetUrl);
        if (cancelled) return;
        setFileSize(size);

        if (!forceOpen && size != null && size > OFFICE_LARGE_FILE_BYTES) {
          setStatus("prompt");
          return;
        }

        setStatus("loading");
        setStage("Downloading workbook...");
        const response = await fetch(assetUrl);
        if (!response.ok) throw new Error(`Failed to load file (${response.status})`);
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        univerRef.current = await loadUniverSheet(container, buffer, filename, setStage);
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("legacy");
      }
    })();

    return () => {
      cancelled = true;
      univerRef.current?.dispose?.();
      univerRef.current = null;
      container.innerHTML = "";
    };
  }, [assetUrl, filename, forceOpen]);

  if (status === "legacy") {
    return <XlsxViewer path={path} title={title} />;
  }

  if (status === "prompt") {
    return (
      <LargeFilePrompt
        path={path}
        title={title}
        assetUrl={assetUrl}
        filename={filename}
        fileSize={fileSize}
        onForceOpen={() => {
          setStatus("checking");
          setForceOpen(true);
        }}
        onLegacyOpen={() => setStatus("legacy")}
      />
    );
  }

  return (
    <ViewerLayout toolbar={<OfficeChrome path={path} title={title} extLabel="XLSX" />}>
      <div className="relative flex min-h-0 flex-1 flex-col bg-background">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">Univer local preview</span>
          <span>browser-only XLSX renderer</span>
        </div>
        {(status === "checking" || status === "loading") && (
          <SpreadsheetSkeleton stage={stage} />
        )}
        <div ref={containerRef} className="min-h-0 flex-1" />
      </div>
    </ViewerLayout>
  );
}
