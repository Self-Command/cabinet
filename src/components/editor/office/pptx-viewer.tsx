"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  PanelLeft,
  Play,
  Presentation,
  X,
} from "lucide-react";
import { OfficeChrome } from "./office-chrome";
import {
  OfficeLargeFilePrompt,
  OfficePreviewSkeleton,
} from "./office-preview-states";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { ToolbarButton } from "@/components/layout/toolbar-button";
import { Button } from "@/components/ui/button";
import { assetUrlFor } from "@/lib/cabinets/asset-url";
import {
  getAssetSize,
  OFFICE_LARGE_FILE_BYTES,
} from "@/lib/office/browser-file";
import { cn } from "@/lib/utils";

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
  onStage: (stage: string) => void,
  onSlideChange: (index: number) => void
): Promise<AidenPptxViewer> {
  onStage("Loading presentation engine...");
  const { PptxViewer: BrowserPptxViewer, RECOMMENDED_ZIP_LIMITS } =
    await loadAidenPptxModules();

  onStage("Rendering slides in your browser...");
  const viewer = await BrowserPptxViewer.open(buffer, container, {
    fitMode: "contain",
    scrollContainer: container,
    zipLimits: RECOMMENDED_ZIP_LIMITS,
    lazyMedia: true,
    lazySlides: true,
    onSlideChange,
    listOptions: {
      windowed: true,
      initialSlides: 4,
      batchSize: 4,
      overscanViewport: 1.5,
      showSlideLabels: true,
    },
  });
  onSlideChange(Math.max(0, viewer.currentSlideIndex));
  return viewer;
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

function SlideThumbnail({
  viewer,
  index,
  active,
  onClick,
}: {
  viewer: AidenPptxViewer | null;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container || !viewer) return;
    container.innerHTML = "";
    let handle: { dispose?: () => void } | null = null;
    try {
      handle = viewer.renderThumbnailToContainer(index, container, { width: 116 });
    } catch {
      handle = null;
    }
    return () => {
      try {
        handle?.dispose?.();
      } catch {
        // ignore
      }
      container.innerHTML = "";
    };
  }, [viewer, index]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full rounded-md border p-1 text-left transition-colors",
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-background hover:border-primary/40"
      )}
    >
      <div className="mb-1 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <span>Slide {index + 1}</span>
      </div>
      <div
        ref={ref}
        className="aspect-video w-full overflow-hidden rounded bg-muted"
      />
    </button>
  );
}

function PresentationOverlay({
  buffer,
  initialSlide,
  slideCount,
  title,
  onExit,
  onSlideChange,
}: {
  buffer: ArrayBuffer;
  initialSlide: number;
  slideCount: number;
  title: string;
  onExit: () => void;
  onSlideChange: (index: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const slideRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<AidenPptxViewer | null>(null);
  const initialSlideRef = useRef(initialSlide);
  const [index, setIndex] = useState(initialSlide);
  const [stage, setStage] = useState("Starting presentation...");

  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.min(Math.max(nextIndex, 0), Math.max(slideCount - 1, 0));
      setIndex(clamped);
      onSlideChange(clamped);
      void viewerRef.current?.goToSlide(clamped);
    },
    [onSlideChange, slideCount]
  );

  useEffect(() => {
    let cancelled = false;
    const container = slideRef.current;
    if (!container) return;

    container.innerHTML = "";
    void (async () => {
      try {
        setStage("Loading presentation...");
        const { PptxViewer: BrowserPptxViewer, RECOMMENDED_ZIP_LIMITS } =
          await loadAidenPptxModules();
        if (cancelled) return;
        setStage("Rendering slide...");
        const viewer = await BrowserPptxViewer.open(buffer, container, {
          fitMode: "contain",
          zipLimits: RECOMMENDED_ZIP_LIMITS,
          lazyMedia: true,
          lazySlides: true,
          renderMode: "slide",
        });
        viewerRef.current = viewer;
        if (!cancelled) {
          await viewer.goToSlide(initialSlideRef.current);
          setIndex(initialSlideRef.current);
          setStage("");
        }
      } catch {
        if (!cancelled) setStage("Presentation mode failed");
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
  }, [buffer]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    void root.requestFullscreen?.().catch(() => undefined);
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) onExit();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        goTo(index + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goTo(index - 1);
      } else if (event.key === "Escape") {
        onExit();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
      if (document.fullscreenElement === root) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [goTo, index, onExit]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex flex-col bg-black text-white"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-black/95 px-3">
        <div className="min-w-0 truncate text-sm">{title}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60">
            {index + 1} / {Math.max(slideCount, 1)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={onExit}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {stage && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-white/70">
            {stage}
          </div>
        )}
        <div ref={slideRef} className="h-full w-full overflow-hidden" />
      </div>
      <div className="flex h-12 shrink-0 items-center justify-center gap-3 border-t border-white/10 bg-black/95">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/10 hover:text-white"
          disabled={index <= 0}
          onClick={() => goTo(index - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/10 hover:text-white"
          disabled={index >= slideCount - 1}
          onClick={() => goTo(index + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function PptxViewer({ path, title }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<AidenPptxViewer | null>(null);
  const bufferRef = useRef<ArrayBuffer | null>(null);
  const [viewer, setViewer] = useState<AidenPptxViewer | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("checking");
  const [stage, setStage] = useState("Checking file size...");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [slideCount, setSlideCount] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const assetUrl = useMemo(() => assetUrlFor(path), [path]);
  const filename = path.split("/").pop() || title || "Presentation";

  const goToSlide = useCallback((index: number) => {
    const clamped = Math.min(Math.max(index, 0), Math.max(slideCount - 1, 0));
    setCurrentSlide(clamped);
    void viewerRef.current?.goToSlide(clamped);
  }, [slideCount]);

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
    setViewer(null);
    bufferRef.current = null;
    container.innerHTML = "";
    setStatus("checking");
    setStage("Checking file size...");
    setSlideCount(0);
    setCurrentSlide(0);
    setPresenting(false);

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
        bufferRef.current = buffer;

        const loadedViewer = await loadAidenPptx(container, buffer, setStage, (index) => {
          setCurrentSlide(Math.max(0, index));
        });
        if (cancelled) {
          loadedViewer.destroy();
          return;
        }
        viewerRef.current = loadedViewer;
        setViewer(loadedViewer);
        setSlideCount(loadedViewer.slideCount);
        setCurrentSlide(Math.max(0, loadedViewer.currentSlideIndex));
        setStatus("ready");
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
      setViewer(null);
      bufferRef.current = null;
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

  const toolbar = (
    <OfficeChrome path={path} title={title} extLabel="PPTX">
      <ToolbarButton
        icon={PanelLeft}
        label="Slides"
        iconOnly
        active={sidebarOpen}
        onClick={() => setSidebarOpen((value) => !value)}
      />
      <ToolbarButton
        icon={ChevronLeft}
        label="Previous"
        iconOnly
        disabled={status !== "ready" || currentSlide <= 0}
        onClick={() => goToSlide(currentSlide - 1)}
      />
      <span className="hidden min-w-14 text-center text-xs text-muted-foreground md:inline">
        {slideCount > 0 ? `${currentSlide + 1}/${slideCount}` : "--"}
      </span>
      <ToolbarButton
        icon={ChevronRight}
        label="Next"
        iconOnly
        disabled={status !== "ready" || currentSlide >= slideCount - 1}
        onClick={() => goToSlide(currentSlide + 1)}
      />
      <ToolbarButton
        icon={Play}
        label="Play"
        iconOnly
        disabled={status !== "ready" || !bufferRef.current}
        onClick={() => setPresenting(true)}
      />
      <ToolbarButton
        icon={Maximize2}
        label="Fullscreen"
        iconOnly
        disabled={status !== "ready" || !bufferRef.current}
        onClick={() => setPresenting(true)}
      />
    </OfficeChrome>
  );

  return (
    <>
      <ViewerLayout toolbar={toolbar}>
        <div className="relative flex min-h-0 flex-1 flex-col bg-background">
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">Browser PPTX preview</span>
            <span>local high-fidelity renderer</span>
          </div>
          <div className="flex min-h-0 flex-1">
            {sidebarOpen && (
              <aside className="hidden w-40 shrink-0 overflow-y-auto border-r border-border bg-muted/20 p-2 md:block">
                {status === "ready" && slideCount > 0 ? (
                  <div className="space-y-2">
                    {Array.from({ length: slideCount }).map((_, index) => (
                      <SlideThumbnail
                        key={index}
                        viewer={viewer}
                        index={index}
                        active={index === currentSlide}
                        onClick={() => goToSlide(index)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={index}
                        className="aspect-video rounded border border-border bg-muted"
                      />
                    ))}
                  </div>
                )}
              </aside>
            )}
            <div className="relative min-w-0 flex-1">
              {(status === "checking" || status === "loading") && (
                <OfficePreviewSkeleton stage={stage} variant="presentation" />
              )}
              <div
                ref={containerRef}
                className="h-full min-h-0 overflow-auto bg-muted/30 py-4"
              />
            </div>
          </div>
        </div>
      </ViewerLayout>
      {presenting && bufferRef.current && (
        <PresentationOverlay
          buffer={bufferRef.current}
          initialSlide={currentSlide}
          slideCount={slideCount}
          title={title}
          onExit={() => setPresenting(false)}
          onSlideChange={(index) => {
            setCurrentSlide(index);
            void viewerRef.current?.goToSlide(index);
          }}
        />
      )}
    </>
  );
}
