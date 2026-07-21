# Bases View Redesign: Implementation Plan

## Overview

Transform the bases view from a CRM-style frontmatter table (relationship, organization, People/Orgs/Projects) into a **universal academic file browser** — showing all file types (.md, .pdf, .html, .txt, .csv, images, etc.) with instant one-click pill filtering and always-visible search. Simpler interface, fewer clicks, broader coverage.

---

## Phase 1: Data Model — Rename & Expand

### 1a. Rename `NoteEntry` to `FileEntry` (`apps/scholaros/apps/renderer/src/components/bases-view.tsx:64-71`)

The term "note" is misleading when the view shows PDFs and HTML. Rename the type and make it carry file extension and size:

```ts
type FileEntry = {
  path: string;
  name: string;          // without extension
  ext: string;           // ".md", ".pdf", ".html", etc.
  folder: string;
  rootFolder: string;
  fields: Record<string, string | string[]>;
  size: number;          // from TreeNode.stat.size
  mtimeMs: number;
};
```

### 1b. Add file-extension helper constants (`bases-view.tsx: ~line 55`)

Pull the existing category map from `file-path-card.tsx:8-11` into shared constants (or import them):

```ts
const AUDIO_EXTS = new Set(['.wav','.mp3','.m4a','.ogg','.flac','.aac']);
const IMAGE_EXTS  = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp','.ico']);
const VIDEO_EXTS  = new Set(['.mp4','.mov','.avi','.mkv','.webm']);
const DOC_EXTS    = new Set(['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt','.rtf','.csv']);
const CODE_EXTS   = new Set(['.js','.ts','.py','.java','.cpp','.rs','.go','.rb','.css','.json','.xml']);

type FileCategory = 'md' | 'pdf' | 'html' | 'code' | 'image' | 'audio' | 'video' | 'document' | 'other';

function getFileCategory(ext: string): FileCategory { ... }
function getFileIcon(cat: FileCategory): LucideIcon { ... }
```

### 1c. Expand `BUILTIN_COLUMNS` (`bases-view.tsx:101-109`)

Add `ext` and `size` as built-in columns:

```ts
const BUILTIN_COLUMNS = ["name", "ext", "folder", "size", "mtimeMs"] as const;

const BUILTIN_LABELS = {
  name: "Name",
  ext: "Type",
  folder: "Folder",
  size: "Size",
  mtimeMs: "Last Modified",
};
```

### 1d. Update `DEFAULT_BASE_CONFIG` (`bases-view.tsx:84-97`)

Remove old CRM columns, add file-type-relevant defaults:

```ts
export const DEFAULT_BASE_CONFIG: BaseConfig = {
  name: "All Files",
  visibleColumns: ["name", "ext", "folder", "mtimeMs"],
  columnWidths: { name: 240, ext: 70, folder: 160, size: 90, mtimeMs: 140 },
  sort: { field: "mtimeMs", dir: "desc" },
  filters: [],
};
```

### 1e. Update `DEFAULT_WIDTHS` (`bases-view.tsx:112-116`)

```ts
const DEFAULT_WIDTHS: Record<string, number> = {
  name: 240,
  ext: 70,
  folder: 160,
  size: 90,
  mtimeMs: 140,
};
```

---

## Phase 2: File Collection — Remove `.md` Gate

### 2a. Rewrite `collectFiles()` (`bases-view.tsx:147-163`)

Current: filters to `.md` only. New: collects all files, extracts extension, includes size:

```ts
function collectFiles(nodes: TreeNode[]): FileEntryRaw[] {
  return nodes.flatMap((n) =>
    n.kind === "file"
      ? [{
          path: n.path,
          name: n.name.replace(/\.[^.]+$/, ""),
          ext: (n.name.match(/\.[^.]+$/) || [""])[0].toLowerCase(),
          mtimeMs: n.stat?.mtimeMs ?? 0,
          size: n.stat?.size ?? 0,
        }]
      : n.children ? collectFiles(n.children) : [],
  );
}
```

### 2b. Update `enrichedNotes` -> `enrichedFiles` (`bases-view.tsx:291-298`)

Propagate the rename and update the merge to include `ext` and `size`.

---

## Phase 3: Pill Row — One-Click Filtering & Sorting

This replaces the Properties popover, the Filter popover, and the search toggle with a single visible bar.

### 3a. Search bar — always visible (replace `bases-view.tsx:757-790`)

Remove the toggle mechanism. Render the search input unconditionally next to an icon:

```
[ 🔍 Search files...                                         ]
```

When the user types, debounced search fires. For `.md`/`.html`/`.txt`/`.csv`, use the existing `search:query` IPC. For all other files, filter by filename match locally (no search index needed).

### 3b. Type pills (new section after search bar, before table)

Render a row of pill buttons:

```
[All] [MD] [PDF] [HTML] [Code] [Image] [Document] [Audio] [Video]
```

Each pill has a count: `MD (24)`. Clicking a pill sets `activeTypeFilter` to that category. "All" resets it. Only one type pill active at a time (radio behavior).

Implementation approach:
- Compute category counts from the enriched file list in a `useMemo`.
- `activeTypeFilter` state variable (type `FileCategory | 'all'`).
- Filter logic: if `activeTypeFilter !== 'all'`, filter `enrichedFiles` to `getFileCategory(file.ext) === activeTypeFilter`.
- Each pill renders as a `<button>` with active/inactive styling.

### 3c. Sort pills (same row as type pills, right-aligned)

```
[All] [MD] [PDF] ...                Sort: Name ↓ | Modified | Type | Size
```

Clicking a sort pill:
- If it's the current sort field, toggle direction.
- If it's a new field, set it with default direction (asc for Name/Type, desc for Modified/Size).
- Active sort pill shows direction arrow.

These map directly to the existing `config.sort.field` / `config.sort.dir` — no new state needed.

### 3d. Folder pills (second row, shown if folder has files)

Dynamically extracted from top-level folders in the vault:

```
Folders: Courses | Papers | Research | Concepts
```

Clicking a folder pill toggles a folder filter (same as the existing `{ category: "folder", value: "Courses" }` filter). Active folder pills show filled style. Multiple folders can be selected (union).

The existing `config.filters` already supports `{ category: "folder", value }` — no new filter infrastructure needed. The pills just toggle those filters.

---

## Phase 4: Table Rendering Updates

### 4a. `CellRenderer` (`bases-view.tsx:962-1040`) — add `ext` and `size` columns

```ts
if (column === "ext") {
  const cat = getFileCategory(note.ext);
  const icon = getFileIcon(cat);
  return <span>...{icon} {note.ext.toUpperCase()}</span>;
}
if (column === "size") {
  return <span>...{formatFileSize(note.size)}</span>;
}
```

Helper: `formatFileSize(bytes)` -> `"2.3 MB"`, `"340 KB"`, `"1.2 GB"`.

### 4b. `CellRenderer` — remove `last_update` / `first_met` hardcodes (`bases-view.tsx:992-1009`)

Replace with generic date detection: if a frontmatter column's value parses as a date (`!isNaN(Date.parse(v))`), render it as a formatted date. This way `due_date`, `exam_date`, `published_at`, etc. all get date rendering automatically.

### 4c. File rename (`NoteRow`, `bases-view.tsx:1066-1082`)

Current rename code strips `.md` and re-appends it. Handle arbitrary extensions. Store the original extension and re-append it on save.

### 4d. `getSortValue` (`bases-view.tsx:205-217`) — add `ext` and `size`

```ts
if (column === "ext") return note.ext;
if (column === "size") return note.size;
```

### 4e. Column icon in `toTitleCase` for `ext`

`toTitleCase("ext")` should return `"Type"` — add it to `BUILTIN_LABELS`.

---

## Phase 5: Remove Old Components

### 5a. Remove Properties popover (`bases-view.tsx:596-641`)

The Properties popover (show/hide columns) is power-user complexity. With the new smart defaults and pill-based interface, users don't need to manage column visibility. **Remove the entire popover block.**

Frontmatter columns will still auto-appear when frontmatter is detected (via `allPropertyKeys`), but they're additive — the defaults work without them.

### 5b. Remove Filter popover (`bases-view.tsx:643-755`)

Replaced by the type pills, folder pills, and sort pills. **Remove the entire 2-panel popover block.**

The existing `config.filters` infrastructure stays — pills will toggle filters via `toggleFilter()` using the same mechanism. Just the UI entry point changes.

### 5c. Remove search toggle (`bases-view.tsx:757-790`)

Replaced by the always-visible search bar. Existing search logic (debounce, `search:query` IPC, `searchMatchPaths` set) stays — just the toggle wrapper goes.

---

## Phase 6: `FOLDER_ORDER` & `FOLDER_BASE_CONFIGS` in `App.tsx`

### 6a. Remove `FOLDER_BASE_CONFIGS` (`apps/scholaros/apps/renderer/src/App.tsx:477-497`)

These presets (People/Organizations/Projects/Topics with CRM-specific columns) are dead weight. Folder pills dynamically generate from whatever folders exist in the vault — no hardcoded config needed.

### 6b. Simplify `FOLDER_ORDER` (`App.tsx:471`)

Remove the CRM folder list. Either:
- Remove it entirely (folders sort alphabetically), or
- Replace with academic defaults: `["Courses", "Papers", "Research", "Concepts", "Resources"]`

### 6c. Update `toggleExpand` folder-click handler (`App.tsx:4917-4952`)

When clicking a top-level folder, the code currently looks up `FOLDER_BASE_CONFIGS[folderName]` to set custom columns/sort. Since presets are removed, simplify to:

```ts
setBaseConfigByPath((prev) => ({
  ...prev,
  [BASES_DEFAULT_TAB_PATH]: {
    ...DEFAULT_BASE_CONFIG,
    name: folderName,
    filters: [{ category: "folder", value: folderName }],
  },
}));
```

---

## Phase 7: Context Menu — Add "Open With" for Non-MD Files

### 7a. Extend `actions` prop (`bases-view.tsx:140-144`)

Add two new action callbacks:

```ts
actions?: {
  rename: ...
  remove: ...
  copyPath: ...
  openInSystemViewer?: (path: string) => Promise<void>;
  openInBrowser?: (path: string) => Promise<void>;
};
```

### 7b. Dynamic context menu items (`bases-view.tsx:1128-1153`)

Based on file extension:
- `.md` -> rename, delete (existing)
- `.pdf` -> "Open with system viewer", "Copy path"
- `.html` -> "Open in browser", "Copy path"
- `.png`/`.jpg` etc. -> "Open with system viewer", "Copy path"

---

## Phase 8: "Open File" Opens a New Tab

### 8a. Update `onSelectNote` callback (`App.tsx:6207`)

Currently `onSelectNote={(path) => navigateToFile(path)}`. Ensure `navigateToFile` opens non-MD files in a new tab with an appropriate viewer:
- `.md` -> markdown editor (existing behavior)
- `.html` -> embedded webview or new tab with HTML preview
- `.pdf` -> PDF viewer or system default
- Images -> image viewer
- Other -> "Open with system viewer" fallback

---

## Phase 9: Update AI Tool Descriptions

### 9a. `builtin-tools.ts` parameter descriptions (`~line 1943`)

Change examples from `People/John.md` to academic examples like `Courses/Biology-101/Lecture-Notes.md`.

### 9b. `app-navigation` skill prompt (`apps/scholaros/packages/core/src/application/assistant/skills/app-navigation/skill.ts`)

Update workflow examples:
- "Show me all notes for Biology 101" -> filter by folder or course
- "Find PDFs from last week" -> filter by type + modified
- "Show lecture notes" -> filter by folder `Courses`

Remove the `relationship=customer` example. Add note that type filtering now works on file extensions.

### 9c. `get-base-state` action (`builtin-tools.ts:2057-2114`)

Currently only scans `.md` files. Consider extending to scan common text files (.html, .txt, .csv) for frontmatter-like metadata, or just .md is fine since those are the only ones with structured frontmatter.

---

## Phase 10: Save Dialog & Empty State

### 10a. Save dialog placeholder (`bases-view.tsx:937`)

Change from `"e.g. Contacts, Projects..."` to `"e.g. Active Papers, CS Lectures..."`.

### 10b. Empty state text (`bases-view.tsx:880-882`)

Change from `"No matching notes"` / `"Try clearing your filters..."` to: `"No matching files"` / `"Try a different filter or add files to your vault."`

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `apps/scholaros/apps/renderer/src/components/bases-view.tsx` | Types, collectFiles, new pill row UI, remove popovers, new cell renderers, context menu |
| `apps/scholaros/apps/renderer/src/App.tsx` | Remove FOLDER_BASE_CONFIGS, update FOLDER_ORDER, simplify folder-click handler, update navigateToFile |
| `apps/scholaros/apps/renderer/src/components/file-path-card.tsx` | (optional) Extract shared extension constants for import |
| `apps/scholaros/packages/core/src/application/lib/builtin-tools.ts` | Update example strings in parameter descriptions |
| `apps/scholaros/packages/core/src/application/assistant/skills/app-navigation/skill.ts` | Update workflow examples from CRM to academic |

**No new files.** Every change is an in-place refactoring.

---

## Order of Implementation

1. **Phase 1 + 2** (data model, collectFiles) — changes flow through everything, do these first
2. **Phase 3** (pill row) — the biggest UI change, core of simplicity
3. **Phase 4** (table rendering) — make the new columns render properly
4. **Phase 5** (remove old UI) — delete the replaced components
5. **Phase 6** (App.tsx clean up) — remove CRM relics from the shell
6. **Phase 7 + 8** (context menu, open in new tab) — file-type-aware actions
7. **Phase 9** (AI tools) — update text strings
8. **Phase 10** (polish) — placeholder text, empty state, edge cases
