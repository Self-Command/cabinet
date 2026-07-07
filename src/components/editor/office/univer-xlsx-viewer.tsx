"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { OfficeChrome } from "./office-chrome";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { assetUrlFor } from "@/lib/cabinets/asset-url";
import { xlsxWorkbookToUniverData } from "@/lib/office/xlsx-to-univer";

type UniverHandle = {
  dispose?: () => void;
};

interface Props {
  path: string;
  title: string;
}

async function loadUniverSheet(
  container: HTMLElement,
  buffer: ArrayBuffer,
  filename: string
): Promise<UniverHandle> {
  const [presets, sheetsPreset, sheetsLocale, XLSX] = await Promise.all([
    import("@univerjs/presets"),
    import("@univerjs/preset-sheets-core"),
    import("@univerjs/preset-sheets-core/locales/en-US"),
    import("xlsx"),
  ]);

  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, cellStyles: true });
  const locale = presets.LocaleType.EN_US;
  const workbookData = {
    ...xlsxWorkbookToUniverData(XLSX, workbook, filename),
    locale,
  };
  const { univer, univerAPI } = presets.createUniver({
    locale,
    locales: {
      [locale]: presets.mergeLocales(
        (sheetsLocale as { default?: unknown }).default ?? sheetsLocale
      ),
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

export function UniverXlsxViewer({ path, title }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const univerRef = useRef<UniverHandle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const assetUrl = useMemo(() => assetUrlFor(path), [path]);
  const filename = path.split("/").pop() || title || "Spreadsheet";

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    univerRef.current?.dispose?.();
    univerRef.current = null;
    setStatus("loading");
    setError(null);

    void (async () => {
      try {
        const response = await fetch(assetUrl);
        if (!response.ok) throw new Error(`Failed to load file (${response.status})`);
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        univerRef.current = await loadUniverSheet(container, buffer, filename);
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Univer preview");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      univerRef.current?.dispose?.();
      univerRef.current = null;
      container.innerHTML = "";
    };
  }, [assetUrl, filename]);

  return (
    <ViewerLayout toolbar={<OfficeChrome path={path} title={title} extLabel="XLSX" />}>
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">Univer local preview</span>
          <span>browser-only experimental XLSX renderer</span>
        </div>
        {status === "loading" && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading workbook in your browser...
          </div>
        )}
        {status === "error" && (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md space-y-2 text-center">
              <AlertTriangle className="mx-auto h-5 w-5 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground">
                Univer local preview failed. Disable the experiment to use the legacy viewer.
              </p>
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          className={status === "error" ? "hidden" : "min-h-0 flex-1"}
        />
      </div>
    </ViewerLayout>
  );
}
