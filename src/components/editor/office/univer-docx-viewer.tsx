"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { DocxViewer } from "./docx-viewer";
import { OfficeChrome } from "./office-chrome";
import {
  OfficeLargeFilePrompt,
  OfficePreviewSkeleton,
  OfficeRenderFallback,
} from "./office-preview-states";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { assetUrlFor } from "@/lib/cabinets/asset-url";
import {
  getAssetSize,
  OFFICE_LARGE_FILE_BYTES,
} from "@/lib/office/browser-file";
import { docxBufferToUniverDocData } from "@/lib/office/docx-to-univer";

type UniverHandle = {
  dispose?: () => void;
};

type PreviewStatus = "checking" | "prompt" | "loading" | "ready" | "legacy" | "error";

type UniverDocModules = [
  typeof import("@univerjs/presets"),
  typeof import("@univerjs/presets/preset-docs-core"),
  unknown,
  unknown,
];

interface Props {
  path: string;
  title: string;
}

let univerDocModulesPromise: Promise<UniverDocModules> | null = null;

function loadUniverDocModules(): Promise<UniverDocModules> {
  if (!univerDocModulesPromise) {
    univerDocModulesPromise = Promise.all([
      import("@univerjs/presets"),
      import("@univerjs/presets/preset-docs-core"),
      import("@univerjs/preset-docs-core/locales/en-US"),
      import("jszip"),
    ]);
  }
  return univerDocModulesPromise;
}

async function loadUniverDoc(
  container: HTMLElement,
  buffer: ArrayBuffer,
  filename: string,
  onStage: (stage: string) => void
): Promise<UniverHandle> {
  onStage("Loading document engine...");
  const [presets, docsPreset, docsLocale, JSZip] = await loadUniverDocModules();
  const locale = presets.LocaleType.EN_US;
  const docsLocaleData = (
    (docsLocale as { default?: unknown }).default ?? docsLocale
  ) as Parameters<typeof presets.mergeLocales>[0];

  onStage("Reading DOCX in your browser...");
  const JSZipCtor = (
    (JSZip as { default?: typeof import("jszip") }).default ?? JSZip
  ) as typeof import("jszip");
  const docData = await docxBufferToUniverDocData(
    JSZipCtor,
    buffer,
    filename
  );

  onStage("Mounting Univer document...");
  const { univer, univerAPI } = presets.createUniver({
    locale,
    locales: {
      [locale]: presets.mergeLocales(docsLocaleData),
    },
    presets: [
      docsPreset.UniverDocsCorePreset({
        container,
        header: false,
        toolbar: false,
        footer: false,
      }),
    ],
  });

  univerAPI.createUniverDoc({
    ...docData,
    locale,
  });
  return univer as UniverHandle;
}

export function UniverDocxViewer({ path, title }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const univerRef = useRef<UniverHandle | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("checking");
  const [stage, setStage] = useState("Checking file size...");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrySeed, setRetrySeed] = useState(0);
  const assetUrl = useMemo(() => assetUrlFor(path), [path]);
  const filename = path.split("/").pop() || title || "Document";

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    univerRef.current?.dispose?.();
    univerRef.current = null;
    setStatus("checking");
    setStage("Checking file size...");
    setError(null);

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
        setStage("Downloading document...");
        const response = await fetch(assetUrl);
        if (!response.ok) throw new Error(`Failed to load file (${response.status})`);
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        univerRef.current = await loadUniverDoc(container, buffer, filename, setStage);
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Univer document");
          setStatus("legacy");
        }
      }
    })();

    return () => {
      cancelled = true;
      univerRef.current?.dispose?.();
      univerRef.current = null;
      container.innerHTML = "";
    };
  }, [assetUrl, filename, forceOpen, retrySeed]);

  if (status === "legacy") {
    return <DocxViewer path={path} title={title} />;
  }

  if (status === "error") {
    return (
      <OfficeRenderFallback
        path={path}
        title={title}
        extLabel="DOCX"
        assetUrl={assetUrl}
        filename={filename}
        error={error || "Failed to render document"}
        onRetry={() => {
          setForceOpen(true);
          setRetrySeed((value) => value + 1);
        }}
        onFallbackOpen={() => setStatus("legacy")}
      />
    );
  }

  if (status === "prompt") {
    return (
      <OfficeLargeFilePrompt
        path={path}
        title={title}
        extLabel="DOCX"
        assetUrl={assetUrl}
        filename={filename}
        fileSize={fileSize}
        icon={FileText}
        noun="document"
        onForceOpen={() => {
          setStatus("checking");
          setForceOpen(true);
        }}
        onFallbackOpen={() => setStatus("legacy")}
      />
    );
  }

  return (
    <ViewerLayout toolbar={<OfficeChrome path={path} title={title} extLabel="DOCX" />}>
      <div className="relative flex min-h-0 flex-1 flex-col bg-background">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">Univer local preview</span>
          <span>browser-only DOCX renderer</span>
        </div>
        {(status === "checking" || status === "loading") && (
          <OfficePreviewSkeleton stage={stage} variant="document" />
        )}
        <div ref={containerRef} className="min-h-0 flex-1" />
      </div>
    </ViewerLayout>
  );
}
