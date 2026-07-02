import { useState, useMemo } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, Upload } from "lucide-react";
import type { Citation } from "@/lib/citations";
import { formatAuthor, searchCitations } from "@/lib/citations";

interface CitationPickerProps {
  citations: Citation[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (citation: Citation) => void;
  onImportRequest: () => void;
  trigger?: React.ReactNode;
  side?: "bottom" | "top" | "left" | "right";
  align?: "start" | "center" | "end";
}

export function CitationPicker({
  citations,
  open,
  onOpenChange,
  onSelect,
  onImportRequest,
  trigger,
  side = "bottom",
  align = "start",
}: CitationPickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => (query ? searchCitations(citations, query) : citations),
    [citations, query],
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      ) : null}
      <PopoverContent
        className="w-80 p-0"
        align={align}
        side={side}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              className="h-7 border-0 bg-transparent px-0 text-sm focus-visible:ring-0"
              placeholder="Search citations..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Citation list */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {citations.length === 0
                  ? "No citations in library."
                  : "No matching citations."}
              </div>
            ) : (
              filtered.map((citation) => (
                <CitationItem
                  key={citation.id}
                  citation={citation}
                  onSelect={() => {
                    onSelect(citation);
                    onOpenChange(false);
                    setQuery("");
                  }}
                />
              ))
            )}
          </div>

          {/* Import option */}
          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-2 text-xs text-muted-foreground"
              onClick={() => {
                onImportRequest();
                onOpenChange(false);
              }}
            >
              <Upload className="size-3" />
              Import from Zotero
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CitationItem({
  citation,
  onSelect,
}: {
  citation: Citation;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
          onClick={onSelect}
        >
          <span className="mt-px shrink-0 text-xs text-muted-foreground">
            [@{citation.key}]
          </span>
          <div className="min-w-0 flex flex-col">
            <span className="truncate font-medium">
              {formatAuthor(citation.authors)} ({citation.year})
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {citation.title}
            </span>
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        <div className="space-y-1 text-xs">
          <p className="font-medium">{citation.title}</p>
          <p className="text-muted-foreground">
            {citation.authors.join("; ")}
          </p>
          <p className="text-muted-foreground">{citation.year}</p>
          {citation.journal && (
            <p className="text-muted-foreground">{citation.journal}</p>
          )}
          {citation.doi && (
            <p className="text-muted-foreground">doi:{citation.doi}</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
