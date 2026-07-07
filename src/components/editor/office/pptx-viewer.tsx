"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Presentation } from "lucide-react";
import { OfficeChrome } from "./office-chrome";
import {
  OfficeLargeFilePrompt,
  OfficePreviewSkeleton,
} from "./office-preview-states";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { assetUrlFor } from "@/lib/cabinets/asset-url";
import {
  getAssetSize,
  OFFICE_LARGE_FILE_BYTES,
} from "@/lib/office/browser-file";

type PreviewStatus = "checking" | "prompt" | "loading" | "ready" | "legacy";
type AidenPptxModules = typeof import("@aiden0z/pptx-renderer");
type AidenPptxViewer = InstanceType<AidenPptxModules["PptxViewer"]>;

interface Props {
  path: string;
  title: string;
}

let aidenPptxModulesPromise: Promise<AidenPptxModules> | null = null;

function loadAidenPptxModules(): Promise<AidenPptxModules> {
  if (!aidenPptxModulesPromise) {
    aidenPptxModulesPromise = import("@aiden0z/pptx-renderer");
  }
  return aidenPptxModulesPromise;
}

async function loadAidenPptx(
  container: HTMLElement,
  buffer: ArrayBuffer,
  onStage: (stage: string) => void
): Promise<AidenPptxViewer> {
  onStage("Loading presentation engine...");
  const { PptxViewer: BrowserPptxViewer, RECOMMENDED_ZIP_LIMITS } =
    await loadAidenPptxModules();

  onStage("Rendering slides in your browser...");
  return BrowserPptxViewer.open(buffer, container, {
    fitMode: "contain",
    zipLimits: RECOMMENDED_ZIP_LIMITS,
    lazyMedia: true,
    lazySlides: true,
    listOptions: {
      windowed: true,
      initialSlides: 4,
      batchSize: 4,
      overscanViewport: 1.5,
    },
  });
}

function LegacyPptxViewer({ path, title }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const assetUrl = assetUrlFor(path);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    let previewer: { destroy?: () => void } | null = null;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ init }, res] = await Promise.all([
          import("pptx-preview"),
          fetch(assetUrl),
        ]);
        if (cancelled) return;
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        const width = container.clientWidth || 960;
        const height = Math.round((width * 9) / 16);
        previewer = init(container, { width, height, mode: "list" }) as unknown as {
          destroy?: () => void;
          preview: (buf: ArrayBuffer) => Promise<unknown>;
        };
        await (previewer as unknown as { preview: (b: ArrayBuffer) => Promise<unknown> }).preview(
          buf
        );
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render presentation");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        previewer?.destroy?.();
      } catch {
        /* ignore */
      }
    };
  }, [assetUrl]);

  return (
    <ViewerLayout toolbar={<OfficeChrome path={path} title={title} extLabel="PPTX" />}>
      <div className="relative flex-1 overflow-auto bg-muted/30 py-4">
        {loading && !error && (
          <OfficePreviewSkeleton
            stage="Rendering with Cabinet preview..."
            variant="presentation"
          />
        )}
        {error && (
          <div className="h-[60vh] flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground">
                Try downloading the file and opening it externally.
              </p>
            </div>
          </div>
        )}
        <div ref={containerRef} className="pptx-viewer-body mx-auto max-w-5xl px-4" />
      </div>
    </ViewerLayout>
  );
}

export function PptxViewer({ path, title }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<AidenPptxViewer | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("checking");
  const [stage, setStage] = useState("Checking file size...");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const assetUrl = useMemo(() => assetUrlFor(path), [path]);
  const filename = path.split("/").pop() || title || "Presentation";

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    try {
      viewerRef.current?.destroy();
    } catch {
      // ignore cleanup errors from the renderer
    }
    viewerRef.current = null;
    container.innerHTML = "";
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
        setStage("Downloading presentation...");
        const response = await fetch(assetUrl);
        if (!response.ok) throw new Error(`Failed to load file (${response.status})`);
        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        viewerRef.current = await loadAidenPptx(container, buffer, setStage);
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("legacy");
      }
    })();

    return () => {
      cancelled = true;
      try {
        viewerRef.current?.destroy();
      } catch {
        // ignore
      }
      viewerRef.current = null;
      container.innerHTML = "";
    };
  }, [assetUrl, forceOpen]);

  if (status === "legacy") {
    return <LegacyPptxViewer path={path} title={title} />;
  }

  if (status === "prompt") {
    return (
      <OfficeLargeFilePrompt
        path={path}
        title={title}
        extLabel="PPTX"
        assetUrl={assetUrl}
        filename={filename}
        fileSize={fileSize}
        icon={Presentation}
        noun="presentation"
        onForceOpen={() => {
          setStatus("checking");
          setForceOpen(true);
        }}
        onFallbackOpen={() => setStatus("legacy")}
      />
    );
  }

  return (
    <ViewerLayout toolbar={<OfficeChrome path={path} title={title} extLabel="PPTX" />}>
      <div className="relative flex min-h-0 flex-1 flex-col bg-background">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">Browser PPTX preview</span>
          <span>local high-fidelity renderer</span>
        </div>
        {(status === "checking" || status === "loading") && (
          <OfficePreviewSkeleton stage={stage} variant="presentation" />
        )}
        <div ref={containerRef} className="min-h-0 flex-1 overflow-auto bg-muted/30 py-4" />
      </div>
    </ViewerLayout>
  );
}
