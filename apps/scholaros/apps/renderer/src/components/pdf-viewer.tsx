"use client";

import * as React from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2, Plus, Minus, Maximize } from "lucide-react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function tryBase64ToUint8Array(base64: string): Uint8Array | null {
  try {
    return base64ToUint8Array(base64);
  } catch {
    return null;
  }
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.1;

function clampScale(s: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100));
}

export function PdfViewer({ base64Data }: { base64Data: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = React.useState<number>(0);
  const [scale, setScale] = React.useState(1);
  const [fitScale, setFitScale] = React.useState<number | null>(null);

  const pdfFile = React.useMemo(() => {
    const bytes = tryBase64ToUint8Array(base64Data);
    return bytes ? { data: bytes } : null;
  }, [base64Data]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const zoomIn = () => setScale((s) => clampScale(s + ZOOM_STEP));
  const zoomOut = () => setScale((s) => clampScale(s - ZOOM_STEP));

  const fitToScreen = React.useCallback(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth - 32;
    if (w > 0) {
      const fit = clampScale(w / 900);
      setFitScale(fit);
      setScale(fit);
    }
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setScale((s) => clampScale(s + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const displayScale = fitScale ?? scale;
  const pageWidth = 900;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-center gap-3 border-b border-border px-4 py-1.5 text-sm text-muted-foreground shrink-0">
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          className="disabled:opacity-30 hover:text-foreground transition-colors"
          title="Zoom out (Ctrl+Scroll)"
        >
          <Minus className="size-4" />
        </button>
        <span className="min-w-[3ch] text-center tabular-nums">
          {Math.round(displayScale * 100)}%
        </span>
        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
          className="disabled:opacity-30 hover:text-foreground transition-colors"
          title="Zoom in (Ctrl+Scroll)"
        >
          <Plus className="size-4" />
        </button>
        <span className="w-px h-4 bg-border" />
        <button
          type="button"
          onClick={fitToScreen}
          className="hover:text-foreground transition-colors"
          title="Fit to screen"
        >
          <Maximize className="size-4" />
        </button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto flex flex-col items-center p-4 gap-4">
        <Document
          file={pdfFile}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          }
          error={
            <div className="flex items-center justify-center py-12 text-destructive">
              Failed to load PDF
            </div>
          }
        >
          {Array.from(new Array(numPages), (_el, index) => (
            <Page
              key={`page_${index + 1}`}
              pageNumber={index + 1}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              className="shadow-xl mb-4 last:mb-0"
              width={pageWidth}
              scale={displayScale}
            />
          ))}
        </Document>
      </div>
    </div>
  );
}
