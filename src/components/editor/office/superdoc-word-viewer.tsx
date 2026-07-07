"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Edit3,
  Eye,
  FileText,
  Maximize2,
  MessageSquare,
  Save,
} from "lucide-react";
import { SuperDocEditor } from "@superdoc-dev/react";
import type { DocumentMode, SuperDocRef } from "@superdoc-dev/react";
import { superdocFonts } from "@superdoc-dev/fonts";
import { OfficeChrome } from "./office-chrome";
import {
  OfficeLargeFilePrompt,
  OfficePreviewSkeleton,
  OfficeRenderFallback,
} from "./office-preview-states";
import { ToolbarButton } from "@/components/layout/toolbar-button";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { assetUrlFor } from "@/lib/cabinets/asset-url";
import {
  fetchAssetArrayBuffer,
  getAssetSize,
  isOleCompoundBuffer,
  isZipBuffer,
  OFFICE_LARGE_FILE_BYTES,
} from "@/lib/office/browser-file";
import { convertLegacyOfficeFile } from "@/lib/office/legacy-conversion";

type PreviewStatus =
  | "checking"
  | "converting"
  | "prompt"
  | "loading"
  | "ready"
  | "saving"
  | "error";

interface Props {
  path: string;
  title: string;
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function modeLabel(mode: DocumentMode): string {
  if (mode === "editing") return "Edit";
  if (mode === "suggesting") return "Suggest";
  return "View";
}

export function SuperDocWordViewer({ path, title }: Props) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const superdocRef = useRef<SuperDocRef | null>(null);
  const [activePath, setActivePath] = useState(path);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [mode, setMode] = useState<DocumentMode>("editing");
  const [status, setStatus] = useState<PreviewStatus>("checking");
  const [stage, setStage] = useState("Checking file size...");
  const [progress, setProgress] = useState<number | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrySeed, setRetrySeed] = useState(0);
  const assetUrl = useMemo(() => assetUrlFor(activePath), [activePath]);
  const filename = activePath.split("/").pop() || title || "Document.docx";
  const isLegacyDoc = /\.doc$/i.test(path);

  useEffect(() => {
    setActivePath(path);
    setDocumentFile(null);
    setForceOpen(false);
    setRetrySeed((value) => value + 1);
  }, [path]);

  useEffect(() => {
    let cancelled = false;

    setStatus("checking");
    setStage("Checking file size...");
    setProgress(null);
    setError(null);
    setDocumentFile(null);

    void (async () => {
      try {
        const loadPath = activePath;
        const nextAssetUrl = assetUrlFor(loadPath);
        const size = await getAssetSize(nextAssetUrl);
        if (cancelled) return;
        setFileSize(size);

        if (!forceOpen && size != null && size > OFFICE_LARGE_FILE_BYTES) {
          setStatus("prompt");
          return;
        }

        setStatus("loading");
        setStage("Downloading document...");
        const buffer = await fetchAssetArrayBuffer(nextAssetUrl, (next) => {
          if (!cancelled) setProgress(next.percent);
        });
        if (cancelled) return;
        if (isOleCompoundBuffer(buffer)) {
          setStatus("converting");
          setStage("Converting legacy Word file to DOCX...");
          const converted = await convertLegacyOfficeFile(loadPath);
          if (cancelled) return;
          setActivePath(converted.path);
          return;
        }
        if (!isZipBuffer(buffer)) {
          throw new Error("This file is not a supported Word document");
        }
        const file = new File([buffer], filename.replace(/\.doc$/i, ".docx"), {
          type: DOCX_MIME,
        });
        setStage("Mounting Word editor...");
        setDocumentFile(file);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Word document");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePath, filename, forceOpen, retrySeed]);

  const requestFullscreen = () => {
    void shellRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const exportDocument = async (triggerDownload: boolean) => {
    const superdoc = superdocRef.current?.getInstance();
    if (!superdoc) return null;
    return superdoc.export({
      exportType: ["docx"],
      exportedName: filename.replace(/\.doc$/i, ".docx"),
      triggerDownload,
    });
  };

  const saveDocument = async () => {
    try {
      setStatus("saving");
      setStage("Exporting DOCX from browser...");
      const blob = await exportDocument(false);
      if (!blob) throw new Error("Word editor is not ready");
      setStage("Saving document...");
      const response = await fetch(assetUrl, {
        method: "PUT",
        headers: { "Content-Type": DOCX_MIME },
        body: blob,
      });
      if (!response.ok) throw new Error(`Failed to save document (${response.status})`);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save document");
      setStatus("error");
    }
  };

  if (status === "prompt") {
    return (
      <OfficeLargeFilePrompt
        path={activePath}
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
      />
    );
  }

  if (status === "error") {
    return (
      <OfficeRenderFallback
        path={activePath}
        title={title}
        extLabel={isLegacyDoc ? "DOC" : "DOCX"}
        assetUrl={assetUrl}
        filename={filename}
        error={error || "Failed to render document"}
        onRetry={() => {
          setForceOpen(true);
          setRetrySeed((value) => value + 1);
        }}
      />
    );
  }

  const toolbar = (
    <OfficeChrome path={activePath} title={title} extLabel={isLegacyDoc ? "DOCX" : "DOCX"}>
      <ToolbarButton
        icon={Eye}
        label="View"
        iconOnly
        active={mode === "viewing"}
        disabled={status !== "ready"}
        onClick={() => setMode("viewing")}
      />
      <ToolbarButton
        icon={Edit3}
        label="Edit"
        iconOnly
        active={mode === "editing"}
        disabled={status !== "ready"}
        onClick={() => setMode("editing")}
      />
      <ToolbarButton
        icon={MessageSquare}
        label="Suggest"
        iconOnly
        active={mode === "suggesting"}
        disabled={status !== "ready"}
        onClick={() => setMode("suggesting")}
      />
      <ToolbarButton
        icon={Save}
        label="Save"
        iconOnly
        disabled={status !== "ready"}
        onClick={saveDocument}
      />
      <ToolbarButton
        icon={Download}
        label="Export"
        iconOnly
        disabled={status !== "ready"}
        onClick={() => {
          void exportDocument(true);
        }}
      />
      <ToolbarButton
        icon={Maximize2}
        label="Fullscreen"
        iconOnly
        disabled={status !== "ready"}
        onClick={requestFullscreen}
      />
    </OfficeChrome>
  );

  return (
    <ViewerLayout toolbar={toolbar}>
      <div
        ref={shellRef}
        className="relative flex min-h-0 flex-1 flex-col bg-background"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">SuperDoc Word editor</span>
          <span>browser-only DOCX {modeLabel(mode).toLowerCase()} mode</span>
          {path !== activePath && (
            <span className="text-foreground">converted from legacy Word</span>
          )}
        </div>
        {status !== "ready" && (
          <OfficePreviewSkeleton stage={stage} variant="document" progress={progress} />
        )}
        {documentFile && (
          <SuperDocEditor
            key={activePath}
            ref={superdocRef}
            document={documentFile}
            documentMode={mode}
            role="editor"
            contained
            allowSelectionInViewMode
            rulers
            fonts={superdocFonts}
            className="min-h-0 flex-1"
            style={{ height: "100%" }}
            renderLoading={() => (
              <OfficePreviewSkeleton stage="Starting Word editor..." variant="document" />
            )}
            onContentError={(event) => {
              const detail =
                event.error instanceof Error ? event.error.message : "Document content error";
              setError(detail);
            }}
          />
        )}
      </div>
    </ViewerLayout>
  );
}
