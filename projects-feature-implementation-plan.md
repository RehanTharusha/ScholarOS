# Projects Feature — Implementation Plan

> A scoped workspace within the vault that groups related chats, artifacts, and context. When a project is "active," all new runs and artifacts are stored inside it, and the agent receives the project's accumulated context (memory, prior decisions, next steps) in every new conversation — eliminating the need to re-establish context.

---

## Core Concept

A student working on a large assignment (e.g., "RISC-V Simulator for CS-301") needs multiple chat sessions, produces several artifacts, and wants the agent to remember what was discussed across sessions. Instead of repeating context in every new chat ("look at my management stuff, create a document"), the project scopes everything together and the agent auto-loads the full project memory on each interaction.

---

## Data Model (`packages/shared/src/projects.ts` — new file)

```typescript
Project = {
  id: string;            // "proj_" + nanoid — stable, rename-safe
  name: string;
  description?: string;
  course?: string;       // Links to a vault course (e.g., "CS-301")
  color?: string;        // Optional accent color for UI
  tags?: string[];
  status: "active" | "archived" | "completed";
  createdAt: string;     // ISO datetime
  updatedAt: string;     // ISO datetime
  lastActiveAt: string;  // ISO datetime, updated on each run
}

CreateProjectOptions = { name, description?, course?, color?, tags? }
UpdateProjectOptions  = { name?, description?, course?, color?, tags?, status? }
```

**Why `proj_` + nanoid:** Kebab-case IDs derived from the project name create a filesystem migration problem on rename — the folder must be moved and all references updated. Nanoid IDs are stable across renames; only the metadata file changes.

IPC channel request/response schemas mirror these types (see Phase 1).

---

## Vault Directory Layout

```
<vault>/
├── projects/
│   ├── _active.json                    ← {"activeProjectId": "proj_abc123"} | {}
│   ├── proj_abc123/
│   │   ├── project.json               ← project metadata
│   │   ├── memory.md                  ← auto-maintained project context (AI-readable)
│   │   ├── runs/                      ← project-scoped chat runs (.jsonl)
│   │   ├── artifacts/                 ← project-scoped artifacts
│   │   └── notes/                     ← project-specific knowledge notes
│   └── proj_def456/
│       └── ...
├── .runs-index.json                    ← lightweight index: runId → projectId | null
├── .trash/
│   └── projects/                      ← soft-deleted project folders land here
├── runs/                              ← unchanged, for non-project chats
├── artifacts/                         ← unchanged, for non-project artifacts
└── … (rest of vault unchanged)
```

**Active project storage:** `_active.json` lives inside the vault's `projects/` directory rather than in the app config (`~/.rowboat/config/`). This makes the vault self-contained and portable — copying a vault to another machine preserves the active project state.

**Runs index:** `<vault>/.runs-index.json` maps `runId → projectId | null`. Updated on every run create/delete; rebuilt by scanning on first load. Required because the aggregated `list()` would otherwise scan all `projects/*/runs/` directories on every sidebar render.

---

## Phase 1: Foundation — Types + Storage Layer

| Step | File                                    | What                                                                                                                                                                                                                                                              |
| ---- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | `packages/shared/src/projects.ts`       | `Project`, `ProjectSummary`, `CreateProjectOptions`, `UpdateProjectOptions`, IPC schemas                                                                                                                                                                          |
| 1.2  | `packages/shared/src/index.ts`          | Re-export the new module                                                                                                                                                                                                                                          |
| 1.3  | `packages/shared/src/ipc.ts`            | Add channels: `projects:list`, `projects:get`, `projects:create`, `projects:rename`, `projects:delete`, `projects:set-active`, `projects:get-active`, `projects:get-context`, `projects:update-context`                                                           |
| 1.4  | `packages/core/src/projects/repo.ts`    | `IProjectsRepo` interface + `FSProjectsRepo` — CRUD against `<vault>/projects/`. Each project = a directory with `project.json`. Handles directory create, metadata read/write, listing, deletion (moves to `.trash/projects/`), active state via `_active.json`. |
| 1.5  | `packages/core/src/projects/project.ts` | Higher-level operations using the repo (same pattern as `runs/runs.ts`).                                                                                                                                                                                          |
| 1.6  | `packages/core/src/config/config.ts`    | Add `projects/` to `ensureDirs()`.                                                                                                                                                                                                                                |
| 1.7  | `packages/core/src/di/container.ts`     | Register `IProjectsRepo` binding.                                                                                                                                                                                                                                 |
| 1.8  | `apps/main/src/ipc.ts`                  | Wire project IPC handlers.                                                                                                                                                                                                                                        |
| 1.9  | `apps/preload/src/preload.ts`           | Expose `window.electronAPI.projects.*`.                                                                                                                                                                                                                           |

### `FSProjectsRepo` interface

```typescript
class FSProjectsRepo {
  list(): ProjectSummary[]; // scans projects/, reads each project.json,
  // augments with run/artifact counts
  get(id: string): Project | null;
  create(opts: CreateProjectOptions): Project;
  rename(id: string, name: string): void;
  delete(id: string): void; // moves folder to .trash/projects/
  setActive(id: string | null): void; // writes _active.json; null = global mode
  getActive(): Project | null;
  getContext(id: string): string; // reads memory.md
  appendContext(id: string, text: string): void;
  getRunsDir(id: string): string;
  getArtifactsDir(id: string): string;
}
```

---

## Phase 2: Run Scoping + Index

The `FSRunsRepo` becomes project-aware — this is the most critical architectural change.

| Step | File                             | What                                                                                                                                                                                                                                                                              |
| ---- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | `packages/shared/src/runs.ts`    | Add optional `projectId?: string` to `Run` and `CreateRunOptions`.                                                                                                                                                                                                                |
| 2.2  | `packages/shared/src/ipc.ts`     | Update `runs:list` to accept optional `projectId` filter.                                                                                                                                                                                                                         |
| 2.3  | `packages/core/src/runs/repo.ts` | Modify `FSRunsRepo` to compute storage path dynamically: `projectId ? path.join(WorkDir, 'projects', projectId, 'runs') : path.join(WorkDir, 'runs')`. `list()` without filter uses `.runs-index.json` to aggregate across all locations. Add `listForProject(projectId)` method. |
| 2.4  | `packages/core/src/runs/runs.ts` | Pass `projectId` through from opts to repo. On run create/delete, update `.runs-index.json`.                                                                                                                                                                                      |
| 2.5  | `apps/main/src/ipc.ts`           | Forward `projectId` from renderer's `runs:create` and `runs:list` calls.                                                                                                                                                                                                          |

### Runs index strategy

`.runs-index.json` format:

```json
{
  "version": 1,
  "entries": {
    "run_01abc": "proj_abc123",
    "run_02def": null,
    "run_03xyz": "proj_def456"
  }
}
```

- Updated synchronously on every create and delete.
- Rebuilt by full directory scan on first load if the file is missing or corrupt.
- Kept in `<vault>/` root (not inside a project folder) so it can map across all projects.

---

## Phase 3: Agent Context Injection

Every chat within a project starts with full context automatically.

| Step | File                                            | What                                                                                                                                                                                                                                                                            |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | `packages/core/src/projects/context-updater.ts` | After a run finishes in a project, extract a structured summary from the run event log (tool calls used, artifacts created, key messages) and append to `memory.md`. No LLM call — structured extraction only. LLM summarization can be added later as an optional enhancement. |
| 3.2  | `packages/core/src/agents/runtime.ts`           | In `streamAgent()`, if a project is active, load `memory.md` and inject a "Project Context" section into the system prompt.                                                                                                                                                     |
| 3.3  | `packages/core/src/agents/runtime.ts`           | After `run-processing-end`, call `updateProjectMemory()` if the run belongs to a project.                                                                                                                                                                                       |
| 3.4  | `packages/core/src/runs/runs.ts`                | After a run completes (run-stopped event), if the run belongs to a project, trigger the context updater.                                                                                                                                                                        |

### `memory.md` format

```markdown
# Project: RISC-V Simulator

## Overview

Building a pipelined RISC-V simulator in C++ for CS-301.

## Key Decisions

- Cache line size: 64 bytes (matching common L1 cache)
- Use Tomasulo's algorithm for out-of-order execution
- Memory-mapped I/O at 0xFFFF0000–0xFFFF000F

## Next Steps

- [ ] Implement ID stage with register file
- [ ] Add hazard detection unit (RAW hazards)
- [ ] Write test for R-type instructions

## Artifacts

- cpu_design.md — Architecture design document
- pipeline_diagram.svg — Visualization

## Session Log

### 2026-05-28 14:30

**Goal:** Research photosynthesis mechanisms
**Actions:** Searched 3 papers, created notes/Photosynthesis.md, generated report.pdf
**Findings:** C4 plants have higher efficiency in hot climates
**Next steps:** Compare C3 vs C4 energy budgets

### 2026-05-27 10:15

**Goal:** Set up project structure and Makefile
**Actions:** Created Makefile, src/ layout, README.md
**Next steps:** Begin IF stage implementation

## Related Knowledge

- [[Computer Architecture]] — Pipelining concepts
- [[Digital Logic]] — Register file design
```

The `## Overview`, `## Key Decisions`, and `## Next Steps` sections are managed at the project level (user-editable and AI-maintained). The `## Session Log` is append-only — each completed run adds one stamped entry.

### System prompt injection

When an active project exists, append to the system prompt:

```
## Active Project: {project.name}
{memory.md content}

You are currently working within this project. All new artifacts should be saved
to the project's artifacts folder. When the user refers to prior work, use the
session log and key decisions above rather than asking them to repeat context.
```

---

## Phase 4: Active Project State

| Step | File                                    | What                                                                                                                                                                    |
| ---- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | `packages/core/src/projects/project.ts` | Implement `activateProject(id)`, `deactivateProject()`, `getActiveProject()` using `_active.json` in the vault. Activate also updates `lastActiveAt` in `project.json`. |
| 4.2  | `apps/main/src/ipc.ts`                  | Wire `projects:set-active`, `projects:get-active`.                                                                                                                      |

**Design decision:** Active project state is stored in `_active.json` inside the vault (not in app config) so the vault is self-contained and portable. On renderer reload, the main process reads `_active.json` to restore state.

---

## Phase 5: Project Management UI

New components under `apps/renderer/src/components/`:

| Component                | Purpose                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectsPanel`          | Integrated into the Chat sidebar section. When projects exist, active project chats appear at the top grouped under the project name; global chats appear below under "Global Chats". |
| `ProjectSelectorPopover` | Lists all projects with name, color indicator, course tag, run count. Click to activate. "No project" option returns to global mode.                                                  |
| `ProjectHeader`          | Shown in sidebar when a project is active. Displays project name and color indicator. Quick actions: rename, view context, switch project.                                            |
| `ProjectDialog`          | Create/edit modal: name (required), description, course selector, color picker, tags.                                                                                                 |
| `ProjectContextViewer`   | Renders `memory.md` content; allows manual edits to Overview, Key Decisions, Next Steps sections.                                                                                     |

**Sidebar layout when a project is active:**

```
Chat
├── [proj indicator + name] RISC-V Simulator 🔵
│   ├── Chat: Pipeline design session
│   ├── Chat: IF stage implementation
│   └── + New Chat (in project)
├── Global Chats
│   ├── Unrelated chat 1
│   └── Unrelated chat 2
└── + New Project  |  Switch Project
```

**Active project indicator:** A pill badge in the chat sidebar header showing the project name and color. Clicking opens the `ProjectSelectorPopover`. When no project is active, shows "No project — Global".

Follow `design.md` — use `SidebarContentPanel`, `AcademicPageShell`, `AcademicEmptyState` patterns.

---

## Phase 6: Chat Integration

| Step | File                   | What                                                                                                                                                                                                         |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6.1  | `renderer/src/App.tsx` | Add `activeProject` to app state (sourced from `projects:get-active` on mount). When `activeProject` changes, re-query `runs:list` with the project filter for the sidebar.                                  |
| 6.2  | Chat sidebar run list  | Filter to show only runs belonging to the active project, grouped as described in Phase 5. When no project is active, show all runs. Each run item shows a small color indicator if it belongs to a project. |
| 6.3  | "New Chat" button      | When a project is active, create the new run with `projectId` set.                                                                                                                                           |
| 6.4  | Chat tab header        | Show a subtle project badge — project name + color dot — when the open chat belongs to a project.                                                                                                            |

---

## Phase 7: Artifact Scoping

| Step | File                                                                         | What                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1  | All artifact-producing skills (pdf, docx, pptx, xlsx, web-artifacts-builder) | Accept an optional `outputDir` parameter. When a project is active, the system injects `projects/{projectId}/artifacts/` as `outputDir`. When no project is active, default to `artifacts/`. |
| 7.2  | `packages/core/src/projects/project.ts`                                      | Add `getActiveProjectArtifactsDir()` helper — checks `_active.json`, returns the project artifacts path or the global `artifacts/` path. Injected into skill execution context.              |
| 7.3  | Artifacts view                                                               | Add filter toggle: "All" / "Current Project". When filtering by project, read from `projects/{id}/artifacts/`. Project artifacts show a badge with the project name.                         |
| 7.4  | `apps/main/src/ipc.ts`                                                       | `workspace:readdir` — when path is `artifacts` and a project is active, redirect to project artifacts dir.                                                                                   |

**Design decision:** Artifact scoping is enforced via `outputDir` parameter injection into skill execution context — not via agent instruction. Agent instructions are probabilistic; a deterministic parameter is reliable.

---

## Phase 8: Search Scoping

| Step | File               | What                                                                                             |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------ |
| 8.1  | `search/search.ts` | When a project is active, scope search results to that project's runs and artifacts by default.  |
| 8.2  | Search dialog      | Add a project filter option — "Current project only" / "All projects" / specific project picker. |
| 8.3  | `search/search.ts` | Include `memory.md` content in search index for project-level queries.                           |

---

## Phase 9: Edge Cases & Polish

| #   | Concern                         | Solution                                                                                                                                                                                              |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Deleting a project**          | Move `<vault>/projects/<id>/` to `.trash/projects/<id>/`. Update `.runs-index.json` to remove all entries for the project. Confirmation dialog required. Consistent with existing trash behaviour.    |
| 2   | **Archiving a project**         | Set `status: "archived"`. Archived projects don't appear in the quick-switch list or active sidebar, but remain searchable and restorable.                                                            |
| 3   | **Run migration**               | No automatic migration. Existing runs stay in `<vault>/runs/` and appear under "Global Chats". Context menu action on a run: "Move to project" — moves the `.jsonl` file, updates `.runs-index.json`. |
| 4   | **Global vs project runs**      | Both coexist. When no project is active, runs go to `<vault>/runs/`. When active, runs go to `<vault>/projects/<id>/runs/`. Sidebar can show "All Chats" (aggregated via index) or filter by project. |
| 5   | **Switching projects mid-chat** | Not allowed. Active project is set before starting a chat. Existing open chats stay in their original project. New chats go to the newly activated project.                                           |
| 6   | **Empty project**               | Show `AcademicEmptyState`: "No chats yet. Start a conversation to begin working on this project."                                                                                                     |
| 7   | **Many projects**               | Add search/filter for project names in the `ProjectSelectorPopover`.                                                                                                                                  |
| 8   | **Context updater failure**     | If `appendContext()` fails after a run, log the error silently — do not surface it to the user. The run still completes normally. Context can be manually edited via `ProjectContextViewer`.          |
| 9   | **Corrupt `.runs-index.json`**  | On parse failure, rebuild from scratch by scanning `runs/` and all `projects/*/runs/`. Log a warning.                                                                                                 |

---

## Build Order

```
Phase 1 (Types + Storage)
    → Phase 4 (Active Project State)
    → Phase 2 (Run Scoping + Index)
    → Phase 5 (Project Management UI)
    → Phase 6 (Chat Integration)
    → Phase 3 (Agent Context Injection)
    → Phase 7 (Artifact Scoping)
    → Phase 8 (Search Scoping)
    → Phase 9 (Edge Cases & Polish)
```

**Rationale:** Foundation first so everything else has something to build on. Active state early so there is something to query from the renderer. Run scoping next — the most impactful architectural change. UI once the backend works. Agent context last in the backend phases, since it depends on runs being scoped and memory working. Artifacts and search are lower priority. Polish is last because it depends on everything above being stable.

---

## Key Files Changed (Summary)

| Layer        | Files Changed                                                                                                             | Files Created                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Shared types | `index.ts`, `runs.ts`, `ipc.ts`                                                                                           | `projects.ts`                                                                                       |
| Core logic   | `config/config.ts`, `runs/repo.ts`, `runs/runs.ts`, `agents/runtime.ts`, `di/container.ts`, all artifact-producing skills | `projects/repo.ts`, `projects/project.ts`, `projects/context-updater.ts`                            |
| Main IPC     | `ipc.ts`                                                                                                                  | —                                                                                                   |
| Preload      | `preload.ts`                                                                                                              | —                                                                                                   |
| Renderer     | `App.tsx`, sidebar components, artifacts view, search dialog                                                              | `ProjectsPanel`, `ProjectSelectorPopover`, `ProjectHeader`, `ProjectDialog`, `ProjectContextViewer` |

---

## Future Extensions (Out of Scope Now)

- **Project templates** — pre-built `memory.md` scaffolds for common project types (essay, lab report, software project)
- **LLM-assisted context summarization** — optional post-run LLM call to produce richer `memory.md` entries beyond structured extraction
- **Multi-project dashboard** — see all projects with progress indicators and last-active dates
- **Project sharing** — export/import a project folder (zip of `project.json` + `memory.md` + `notes/`)
- **Deadline tracking** — add due dates to projects, surface upcoming deadlines in sidebar
- **Project-level agent instructions** — custom system prompt additions per project, set via `ProjectDialog`
- **Drag-and-drop run migration** — move a run between projects or to global by dragging in the sidebar
