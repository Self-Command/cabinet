"use client";

import type { LucideIcon } from "lucide-react";
import { Download, FileText, FolderOpen, Loader2, RotateCcw } from "lucide-react";
import { OfficeChrome } from "./office-chrome";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { Button } from "@/components/ui/button";
import { downloadAsset, formatFileSize } from "@/lib/office/browser-file";

export function OfficePreviewSkeleton({
  stage,
  variant = "document",
}: {
  stage: string;
  variant?: "document" | "spreadsheet" | "presentation";
}) {
  const body =
    variant === "spreadsheet" ? (
      <div className="grid flex-1 grid-cols-[48px_repeat(6,minmax(72px,1fr))] grid-rows-[28px_repeat(14,32px)] overflow-hidden p-4">
        {Array.from({ length: 105 }).map((_, index) => (
          <div
            key={index}
            className="border-b border-r border-border/60 bg-muted/20"
          />
        ))}
      </div>
    ) : variant === "presentation" ? (
      <div className="flex flex-1 flex-col items-center gap-4 overflow-hidden p-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="aspect-video w-full max-w-4xl rounded-md border border-border bg-muted/30"
          />
        ))}
      </div>
    ) : (
      <div className="flex flex-1 justify-center overflow-hidden p-6">
        <div className="h-full w-full max-w-3xl rounded-md border border-border bg-muted/20 p-8">
          <div className="mb-6 h-5 w-2/3 rounded bg-muted" />
          {Array.from({ length: 14 }).map((_, index) => (
            <div
              key={index}
              className="mb-3 h-3 rounded bg-muted/80"
              style={{ width: `${92 - (index % 4) * 9}%` }}
            />
          ))}
        </div>
      </div>
    );

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background/95">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{stage}</span>
      </div>
      {body}
    </div>
  );
}

export function OfficeLargeFilePrompt({
  path,
  title,
  extLabel,
  assetUrl,
  filename,
  fileSize,
  icon: Icon = FileText,
  noun,
  onForceOpen,
  onFallbackOpen,
  fallbackLabel = "Cabinet preview",
}: {
  path: string;
  title: string;
  extLabel: string;
  assetUrl: string;
  filename: string;
  fileSize: number | null;
  icon?: LucideIcon;
  noun: string;
  onForceOpen: () => void;
  onFallbackOpen?: () => void;
  fallbackLabel?: string;
}) {
  return (
    <ViewerLayout toolbar={<OfficeChrome path={path} title={title} extLabel={extLabel} />}>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-5 text-center shadow-sm">
          <Icon className="mx-auto h-8 w-8 text-primary" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Large {noun}</h2>
            <p className="text-xs leading-5 text-muted-foreground">
              This file is {formatFileSize(fileSize)}. Opening it in the browser may take a
              while and can use a lot of memory.
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
            {onFallbackOpen && (
              <Button type="button" variant="outline" size="sm" onClick={onFallbackOpen}>
                {fallbackLabel}
              </Button>
            )}
            <Button type="button" size="sm" onClick={onForceOpen}>
              Force open
            </Button>
          </div>
        </div>
      </div>
    </ViewerLayout>
  );
}

export function OfficeRenderFallback({
  path,
  title,
  extLabel,
  assetUrl,
  filename,
  error,
  onRetry,
  onFallbackOpen,
  fallbackLabel = "Cabinet preview",
}: {
  path: string;
  title: string;
  extLabel: string;
  assetUrl: string;
  filename: string;
  error: string;
  onRetry: () => void;
  onFallbackOpen?: () => void;
  fallbackLabel?: string;
}) {
  return (
    <ViewerLayout toolbar={<OfficeChrome path={path} title={title} extLabel={extLabel} />}>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-5 text-center shadow-sm">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Preview failed</h2>
            <p className="text-xs leading-5 text-muted-foreground">{error}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
            {onFallbackOpen && (
              <Button type="button" variant="outline" size="sm" onClick={onFallbackOpen}>
                {fallbackLabel}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => downloadAsset(assetUrl, filename)}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        </div>
      </div>
    </ViewerLayout>
  );
}

export function OfficeUnsupportedFile({
  path,
  title,
  extLabel,
  assetUrl,
  filename,
  message,
}: {
  path: string;
  title: string;
  extLabel: string;
  assetUrl: string;
  filename: string;
  message: string;
}) {
  const revealInFinder = async () => {
    try {
      await fetch("/api/system/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    } catch {
      // ignore
    }
  };

  return (
    <ViewerLayout toolbar={<OfficeChrome path={path} title={title} extLabel={extLabel} />}>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-5 text-center shadow-sm">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Preview unavailable</h2>
            <p className="text-xs leading-5 text-muted-foreground">{message}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={revealInFinder}>
              <FolderOpen className="h-3.5 w-3.5" />
              Reveal
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => downloadAsset(assetUrl, filename)}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        </div>
      </div>
    </ViewerLayout>
  );
}
