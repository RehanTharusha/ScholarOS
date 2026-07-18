import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Brain,
  FileText,
  FileSpreadsheet,
  Presentation,
  Globe,
  Mic,
  Search,
  GraduationCap,
  ClipboardList,
  Network,
  FileCode2,
  Puzzle,
  Zap,
  File,
  ArrowUpDown,
  BookMarked,
  Video,
  Layers,
  BrainCircuit,
} from "lucide-react";

export interface SkillEntry {
  id: string;
  title: string;
  summary: string;
}

export const SKILL_LIST: SkillEntry[] = [
  {
    id: "doc-collab",
    title: "Document Collaboration",
    summary: "Create, edit, and refine notes and documents in the knowledge base.",
  },
  {
    id: "organize-files",
    title: "Organize Files",
    summary: "Find, organize, and tidy up files on the user's machine.",
  },
  {
    id: "mcp-integration",
    title: "MCP Integration",
    summary: "Discover, execute, and integrate MCP tools.",
  },
  {
    id: "app-navigation",
    title: "App Navigation",
    summary: "Navigate the app UI, open notes, switch views, filter the knowledge base.",
  },
  {
    id: "caveman",
    title: "Caveman Mode",
    summary: "Terse compressed assistant tone modes (lite/full/ultra/wenyan).",
  },
  {
    id: "browser-control",
    title: "Browser Control",
    summary: "Control the embedded browser pane - open sites, inspect pages, interact with elements.",
  },
  {
    id: "pdf",
    title: "PDF Processing",
    summary: "Merge, split, rotate, extract text/tables, create, fill forms, OCR PDFs.",
  },
  {
    id: "pptx",
    title: "PowerPoint Presentations",
    summary: "Create, read, and edit PowerPoint slide decks (.pptx).",
  },
  {
    id: "docx",
    title: "Word Documents",
    summary: "Create, read, and edit Word documents (.docx) with full formatting.",
  },
  {
    id: "xlsx",
    title: "Excel Spreadsheets",
    summary: "Create, read, and edit Excel spreadsheets (.xlsx) with formulas and charts.",
  },
  {
    id: "web-artifacts-builder",
    title: "Web Artifacts Builder",
    summary: "Build complex React+Tailwind HTML artifacts as self-contained files.",
  },
  {
    id: "revision-guide",
    title: "Revision Guide",
    summary: "Generate comprehensive HTML revision guides with exam weight badges and diagrams.",
  },
  {
    id: "youtube-video-workflow",
    title: "YouTube Video Finder",
    summary: "Find real YouTube video links for topics using search scraping.",
  },
  {
    id: "anki-flashcards",
    title: "Anki Flashcards",
    summary: "Create, manage, and push Anki flashcards via AnkiConnect.",
  },
  {
    id: "auto-flashcards",
    title: "Auto-Flashcards",
    summary: "Auto-generate flashcards from notes into ScholarOS's spaced repetition system.",
  },
  {
    id: "deep-research",
    title: "Deep Research",
    summary: "Iterative multi-round academic research with web search and report synthesis.",
  },
  {
    id: "study-workflow",
    title: "Study Workflow",
    summary: "Guide through spaced repetition review sessions and exam prep.",
  },
  {
    id: "writing-mode",
    title: "Academic Writing Mode",
    summary: "Write papers with outline panel, inline citations, word count targets, and export.",
  },
  {
    id: "citation-management",
    title: "Citation Management",
    summary: "Manage citations from Zotero/BibTeX, insert in writing, generate bibliographies.",
  },
  {
    id: "course-management",
    title: "Course Management",
    summary: "Organize academic content by courses, manage folder structures.",
  },
  {
    id: "interactive-quiz",
    title: "Interactive Quiz Mode",
    summary: "Active recall sessions with adaptive difficulty and weak-topic analysis.",
  },
  {
    id: "lecture-notes",
    title: "Lecture Notes",
    summary: "Create and review lecture notes using the Cornell method.",
  },
  {
    id: "mind-map",
    title: "Mind Map Generator",
    summary: "Create visual mind maps from course content using Mermaid syntax.",
  },
];

const SKILL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "doc-collab": FileText,
  "organize-files": ArrowUpDown,
  "mcp-integration": Puzzle,
  "app-navigation": Layers,
  "caveman": Zap,
  "browser-control": Globe,
  "pdf": File,
  "pptx": Presentation,
  "docx": FileText,
  "xlsx": FileSpreadsheet,
  "web-artifacts-builder": FileCode2,
  "revision-guide": BookMarked,
  "youtube-video-workflow": Video,
  "anki-flashcards": BookOpen,
  "auto-flashcards": BrainCircuit,
  "deep-research": Search,
  "study-workflow": GraduationCap,
  "writing-mode": FileCode2,
  "citation-management": BookOpen,
  "course-management": Layers,
  "interactive-quiz": ClipboardList,
  "lecture-notes": Mic,
  "mind-map": Network,
};

function SkillList({
  onSelectSkill,
  onOpenChange,
}: {
  onSelectSkill: (skillId: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const filtered = useMemo(() => {
    if (!search.trim()) return SKILL_LIST;
    const q = search.toLowerCase();
    return SKILL_LIST.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q),
    );
  }, [search]);

  useEffect(() => {
    setSearch("");
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  useEffect(() => {
    const el = itemRefs.current.get(activeIndex);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const handleSelect = useCallback(
    (skillId: string) => {
      onSelectSkill(skillId);
      onOpenChange(false);
    },
    [onSelectSkill, onOpenChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[activeIndex]) {
          handleSelect(filtered[activeIndex].id);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    },
    [filtered, activeIndex, handleSelect, onOpenChange],
  );

  return (
    <>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div ref={listRef} className="max-h-80 overflow-y-auto p-1">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Available Skills
        </div>
        {filtered.map((skill, index) => {
          const Icon = SKILL_ICONS[skill.id] || Brain;
          const isActive = index === activeIndex;
          return (
            <button
              key={skill.id}
              ref={(el) => {
                if (el) itemRefs.current.set(index, el);
              }}
              type="button"
              onClick={() => handleSelect(skill.id)}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors outline-none",
                isActive
                  ? "bg-muted/70"
                  : "hover:bg-muted/70",
              )}
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-tight">
                  {skill.title}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground line-clamp-2">
                  {skill.summary}
                </span>
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No skills found
          </div>
        )}
      </div>
    </>
  );
}

interface SkillsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSkill: (skillId: string) => void;
  trigger?: React.ReactNode;
}

export function SkillsPopover({
  open,
  onOpenChange,
  onSelectSkill,
  trigger,
}: SkillsPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-80 max-h-96 p-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SkillList onSelectSkill={onSelectSkill} onOpenChange={onOpenChange} />
      </PopoverContent>
    </Popover>
  );
}

interface SkillsSlashPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSkill: (skillId: string) => void;
  inputRef: React.RefObject<HTMLElement>;
}

export function SkillsSlashPopover({
  open,
  onOpenChange,
  onSelectSkill,
  inputRef,
}: SkillsSlashPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top - 8,
        left: rect.left,
      });
    }
  }, [open, inputRef]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, onOpenChange]);

  if (!open || !position) return null;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 w-80 max-h-96 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
      style={{
        top: position.top,
        left: position.left,
        transform: "translateY(-100%)",
      }}
    >
      <SkillList onSelectSkill={onSelectSkill} onOpenChange={onOpenChange} />
    </div>
  );
}
