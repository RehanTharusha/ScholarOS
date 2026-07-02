import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/citations";
import {
  importFromZoteroJson,
  importFromBibtex,
  formatAuthor,
} from "@/lib/citations";
import { Upload, FileText } from "lucide-react";

interface CitationImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingCitations: Citation[];
  onImport: (newCitations: Citation[]) => void;
}

export function CitationImportModal({
  open,
  onOpenChange,
  existingCitations,
  onImport,
}: CitationImportModalProps) {
  const [zoteroPaste, setZoteroPaste] = useState("");
  const [bibtexPaste, setBibtexPaste] = useState("");
  const [preview, setPreview] = useState<Citation[] | null>(null);
  const [tab, setTab] = useState("zotero");

  const handleZoteroPastePreview = useCallback(() => {
    if (!zoteroPaste.trim()) return;
    const parsed = importFromZoteroJson(zoteroPaste, existingCitations);
    setPreview(parsed);
  }, [zoteroPaste, existingCitations]);

  const handleBibtexPastePreview = useCallback(() => {
    if (!bibtexPaste.trim()) return;
    const parsed = importFromBibtex(bibtexPaste, existingCitations);
    setPreview(parsed);
  }, [bibtexPaste, existingCitations]);

  const handleFileUpload = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        try {
          // Try Zotero JSON first
          const parsed = importFromZoteroJson(text, existingCitations);
          if (parsed.length > 0) {
            setPreview(parsed);
            return;
          }
          // Try BibTeX
          const bibParsed = importFromBibtex(text, existingCitations);
          setPreview(bibParsed);
        } catch {
          setPreview([]);
        }
      };
      reader.readAsText(file);
    },
    [existingCitations],
  );

  const handleConfirm = () => {
    if (preview && preview.length > 0) {
      onImport(preview);
      setZoteroPaste("");
      setBibtexPaste("");
      setPreview(null);
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    setZoteroPaste("");
    setBibtexPaste("");
    setPreview(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Citations</DialogTitle>
          <DialogDescription>
            Import references from Zotero or BibTeX.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-md bg-muted p-1">
            <button
              type="button"
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
                tab === "zotero"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab("zotero")}
            >
              <FileText className="size-3.5" />
              Zotero JSON
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
                tab === "bibtex"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab("bibtex")}
            >
              <FileText className="size-3.5" />
              BibTeX
            </button>
          </div>

          {tab === "zotero" ? (
          <div className="mt-3 space-y-3">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                In Zotero, select items → File → Export Library → Format:
                Zotero RDF, or right-click → Export Items → Zotero JSON.
                Paste the content below:
              </p>
              <textarea
                className="h-32 w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono resize-none focus:border-ring focus:ring-1 focus:ring-ring/50 outline-none"
                placeholder='[{"itemType": "journalArticle", "title": "...", ...}]'
                value={zoteroPaste}
                onChange={(e) => setZoteroPaste(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".json,.rdf";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleFileUpload(file);
                    };
                    input.click();
                  }}
                >
                  <Upload className="size-3.5" />
                  Upload File
                </Button>
                <Button
                  size="sm"
                  onClick={handleZoteroPastePreview}
                  disabled={!zoteroPaste.trim()}
                >
                  Preview
                </Button>
              </div>
            </div>
          </div>
          ) : tab === "bibtex" ? (
          <div className="mt-3 space-y-3">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Paste BibTeX entries below:
              </p>
              <textarea
                className="h-32 w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono resize-none focus:border-ring focus:ring-1 focus:ring-ring/50 outline-none"
                placeholder={`@article{smith2024,\n  title = {Title},\n  author = {John Smith},\n  year = {2024},\n}`}
                value={bibtexPaste}
                onChange={(e) => setBibtexPaste(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".bib,.bibtex";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleFileUpload(file);
                    };
                    input.click();
                  }}
                >
                  <Upload className="size-3.5" />
                  Upload File
                </Button>
                <Button
                  size="sm"
                  onClick={handleBibtexPastePreview}
                  disabled={!bibtexPaste.trim()}
                >
                  Preview
                </Button>
              </div>
            </div>
          </div>
          ) : null}

        {/* Preview */}
        {preview !== null && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">
                {preview.length === 0
                  ? "No new citations found"
                  : `Found ${preview.length} citation${preview.length > 1 ? "s" : ""}`}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setPreview(null)}
              >
                Clear
              </Button>
            </div>
            {preview.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-md border">
                {preview.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start gap-2 border-b px-3 py-1.5 text-xs last:border-0"
                  >
                    <span className="shrink-0 pt-px text-muted-foreground">
                      [@{c.key}]
                    </span>
                    <div>
                      <span className="font-medium">
                        {formatAuthor(c.authors)}
                      </span>{" "}
                      ({c.year}) — {c.title}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!preview || preview.length === 0}
          >
            Import {preview ? preview.length : 0} citation
            {preview && preview.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
