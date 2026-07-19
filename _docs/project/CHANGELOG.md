# ScholarOS Changelog

All notable features and capabilities of ScholarOS.

---


## Unreleased

### Performance & Efficiency

- **Code-split heavy views** — `BasesView`, `ArtifactsView`, `CalendarView`, `CanvasesView` are now lazy-loaded; previously they were pulled into the initial renderer bundle
- **LoadingCard component** — new calm, structural loading skeleton (`page` / `card` / `list` variants) used by every lazy-chunk fallback. Replaces the previous `animate-pulse rounded-lg bg-muted/50` placeholder
- **EmptyState component** — standardized empty-state UI per the design doc (icon + title + description + optional action), with proper `EmptyState` instances in graph, bases, and artifacts views
- **NDJSON run-log compaction** — long-running agent runs no longer grow without bound; logs over 10MB are compacted in-place to keep the first 500 and last 2000 events with a `_compaction_marker` line
- **Image optimization** — uploaded images >500KB are downscaled (max 1920px) and re-encoded as webp at 0.85 quality before being saved to `.assets/`, reducing editor state and markdown bloat
- **LRU cache primitive** — `lib/lru-map.ts` plus `useLRUMap` React hook; ready for the editor-content bounded cache (Plan 01 §4)
- **Perf monitor** — dev-only `useRenderCount` / `useMountCount` / `useStableDuration` helpers; drop into any component to count re-renders during profiling
- **Streaming tokens route through external store** — new `lib/chat-streaming-store.ts` + `contexts/chat-streaming-context.tsx` use `useSyncExternalStore` so the `StreamingMessage` component re-renders on tokens independently of the App tree. The conversation list, file tree, header, and editor no longer participate in the token re-render cascade
- **IPC timing instrumentation** — `registerIpcHandlers` in `apps/main/src/ipc.ts` now records duration and error status for every handler call. Slow (>100ms) or failed calls are stored in a 200-entry ring buffer exposed via `getSlowIpcEntries()` for the future Debug panel
- **Crash resilience in main process** — `process.on('uncaughtException')`, `unhandledRejection`, and `warning'` handlers in `apps/main/src/main.ts` log and continue instead of killing the app. A dialog surfaces uncaught exceptions to the user
- **`window.ipc` is now non-optional in the global type** — 81 "possibly undefined" TS errors eliminated in one shot
- **`CompactionMarkerEvent` added to `RunEvent` Zod union** — NDJSON logs with the `_compaction_marker` line now read cleanly
- **Status bar component** — new `components/ui/status-bar.tsx` with a `StatusBarProvider` and `useStatusBar` hook. Components can `push({id, kind, text, busy, ttlMs, progress})` to surface status in a persistent bottom strip

- **Shared chat helpers** — `streamdownComponents`, `userMessageRemarkPlugins`, `SmoothStreamingMessage`, `matchBillingError`, `BillingErrorCTA` moved to a single `components/chat-shared.tsx` module. Both the main-pane chat (App.tsx) and the right-side chat (chat-sidebar.tsx) now import from it; the two rendering paths can no longer drift
- **Editor tabs use `content-visibility: auto`** — inactive markdown editor tabs skip layout/paint until they become active. The browser defers their work; TipTap still mounts but render cost drops to O(active-tabs) instead of O(all-tabs). One-line CSS change; no JSX surgery required.
- **Editor content store** — `hooks/use-editor-content-store.ts` is a single Map ref + version counter. Replaces the duplicate `editorContentByPath` (state) + `editorContentByPathRef` (ref) pair in App.tsx. Writes bump a render counter; reads are O(1). Other editor state (`editorContent` / `editorContentRef`) kept for backwards compat; migration to the store is a follow-up.
- **Incremental file tree patcher** — `lib/tree-patch.ts` mutates a `Map<path, TreeNode>` in response to a single workspace change event (created/deleted/moved) without touching the disk. App.tsx's `workspace:didChange` handler tries the patcher first for `created`/`deleted` events, falling back to a full `loadDirectory()` for moves and bulk events. Single-file changes no longer trigger a full recursive readdir + stat — O(depth) instead of O(total-files).
- **View-state reducer (Plan 03)** — `contexts/view-state.tsx` is the drop-in target for the 10+ mutually-exclusive view booleans in App.tsx. Defines `ViewState` union, `LayoutState`, `viewReducer`, `useViewState` hook, and helper predicates (`isGraphView`, `isBrowserView`, etc.). The reducer handles all mutual exclusion in one place. App.tsx is not yet migrated to it; the API is in place for follow-up.
- **Undo manager for destructive operations** — `hooks/use-undo.tsx` provides `recordUndoable(op)` and a global Ctrl/Cmd+Z hotkey. The hotkey defers to native undo when focus is in a contentEditable/INPUT/TEXTAREA so editor undo still works. Per-operation history with sonner toast. Mounting the hook in App.tsx is a follow-up.
- **Graph build worker thread** — `graph-build-worker-host.ts` (main side) + `graph-build-worker.js` (worker side) split the heavy `buildWikiGraph` call off the main thread. Wired but not yet called by the `knowledge-graph:buildWiki` IPC handler (rollup config work to bundle the worker JS is a follow-up).
- **Memory pressure sampler** — `main.ts` samples `process.memoryUsage().rss` every 30s, warns at 1.5GB and pushes a `main:mempressure` IPC event. Critical threshold is 2.2GB. The sampler is unref'd so it doesn't keep the process alive.
- **IPC result wrapper infrastructure** — `IpcResult<T>` discriminated union type and `ok`/`err` helpers exported from `apps/main/src/ipc.ts`. Wrapping individual handlers to return `IpcResult` requires updating the Zod response schemas in `packages/shared/src/ipc.ts`; the helpers are in place when that schema migration happens.


## v0.1.5 (2026-06-05)

### New Features

- **Knowledge Graph** — fully functional knowledge graph with CRUD operations, merging, and summarization
- **Deep Research** — deep research capabilities with canvas integration and bug fixes
- **Revision Guide** — updated to Paper design system with KaTeX math rendering and Mermaid diagram support
- **.scholarOS folder** — internal workspace folder setup for better organization

### Fixes & Improvements

- **Canvas & Calendar** — improved state management and UI consistency across canvas and calendar components
- **Cleanup on Install** — automatic cleanup of old cache/config/temp files from previous versions when installing or updating; never touches user vault

### Technical

- **Content Security Policy** — updated CSP to allow CDN resources for KaTeX and Mermaid

---

## AI Copilot & Chat

- **AI-powered chat** with multi-turn conversations across multiple concurrent chat tabs
- **Model selection** per chat tab (OpenAI, Anthropic, Gemini, Ollama, OpenRouter, Vercel AI Gateway, OpenAI-compatible)
- **Web search toggle** per message — enables real-time web search in the agent's context
- **Voice input** — record audio transcribed via Deepgram speech-to-text
- **Text-to-speech** — AI responses spoken aloud via ElevenLabs (summary or full response)
- **Caveman mode** — ultra-compressed response style that cuts ~75% token usage while maintaining technical accuracy
- **Chat history** — persisted runs with context menu to open/delete; clear-all option
- **Streaming responses** with live tool call expandable cards
- **@file mentions** in chat input to reference knowledge files
- **Suggested topics** — view and launch AI-generated study leads
- **Permission system** — approve/deny/always tool execution permissions per session
- **Human-in-the-loop** — agent can ask the user clarifying questions mid-conversation

## Knowledge & File Management

- **Obsidian-compatible markdown vault** — full wiki-link support (`[[Note Name]]`)
- **File tree sidebar** with expand/collapse, rename, delete (to trash), copy path
- **Markdown editor** (TipTap-based) with headings, lists, bold, italic, links, images, code blocks, tables, and frontmatter YAML
- **Inline content blocks** — prompt blocks, Mermaid diagrams, charts, transcripts, embeds, iframes
- **Image upload** to `.assets/` folder within the vault
- **PDF viewer** — inline PDF rendering in the app
- **HTML viewer** — renders `.html` files inline
- **Generic file viewer** — raw content display for any other file type
- **Office file handling** — opens `.docx`, `.xlsx`, `.pptx` in the system default app
- **Graph view** — force-directed visualization of wiki-linked knowledge files
- **Bases (spreadsheet view)** — table view of notes with columns, filters, sort; special folders (People, Organizations, Projects, Topics) have preset views
- **Artifacts** — browser for all non-markdown files (HTML, MD, JSON, CSV, TXT) in the vault
- **Version history** — git-based file history panel: view past commits, restore previous versions
- **Full-text search** — across knowledge files and chat history with type filters
- **Auto-save** with "Saving..." / "Saved" status indicator
- **File tabs** — multiple concurrent file views with tab switching (Cmd+1-9, Cmd+Shift+[/])
- **Back/forward navigation** through view history

## Vault System

- **Vault selection** via native folder picker — choose any directory as your workspace
- **Vault switching** at runtime — triggers watcher restart and full context reload
- **Workspace file watcher** (chokidar-based) — live file change detection with debounced events
- **Hidden directories** — `agents/`, `bases/`, `config/`, `events/`, `logs/` are reserved for internal use

## AI Skills (Loadable Agent Capabilities)

The AI copilot can dynamically load specialized skills to perform complex tasks:

- **Document Collaboration** (`doc-collab`) — create, edit, refine notes; direct-edit and approval modes; wiki-linking
- **Organize Files** (`organize-files`) — find, organize, tidy files; clean up Desktop/Downloads
- **PowerPoint Presentations** (`pptx`) — create and edit slide decks with charts, shapes, images, tables, slide masters using PptxGenJS or XML manipulation
- **Word Documents** (`docx`) — create and edit `.docx` files with full formatting, tables, images, tracked changes, comments, TOC, headers/footers, multi-column layouts
- **Excel Spreadsheets** (`xlsx`) — create and edit `.xlsx` files with formulas, formatting, charts, financial model color standards, formula recalculation via LibreOffice
- **PDF Processing** (`pdf`) — merge, split, rotate, extract text/tables, create new PDFs, OCR, encrypt/decrypt, add watermarks, fill forms, extract images
- **Web Artifacts Builder** (`web-artifacts-builder`) — build self-contained React+TypeScript+Tailwind+shadcn/ui HTML files
- **Revision Guide** (`revision-guide`) — generate comprehensive standalone HTML study guides with exam weight badges, diagrams, comparison tables, quick-fire checklists
- **YouTube Video Link Finder** (`youtube-video-workflow`) — find real YouTube video links for topics via curl-based search scraping
- **Anki Flashcards** (`anki-flashcards`) — create, manage, push Anki flashcards from course materials; Q&A and cloze-deletion cards synced via AnkiConnect
- **MCP Integration** (`mcp-integration`) — discover, execute, and integrate tools from external MCP servers
- **Composio Integration** (`composio-integration`) — interact with 25+ third-party services (Gmail, GitHub, Slack, LinkedIn, Notion, Jira, Google Sheets, etc.)
- **Deletion Guardrails** (`deletion-guardrails`) — confirmation process before removing workflows, agents, or dependencies
- **App Navigation** (`app-navigation`) — navigate the app UI, open notes, switch views, filter/search knowledge base, manage saved bases
- **Browser Control** (`browser-control`) — control the embedded browser pane programmatically
- **Caveman Mode** (`caveman`) — toggle compressed assistant tone (lite/full/ultra/wenyan variants)
- **Builtin Tools Reference** (`builtin-tools`) — understand and use builtin tools in agent definitions

## Builtin Copilot Tools

Tools available to the AI agent natively (no skill load required):

### Workspace Operations
- Read, write, edit, delete, rename, copy files and directories
- Glob pattern search and regex content search (ripgrep)
- File/directory existence checks, stats, recursive directory listing
- Atomic writes with ETag conflict detection

### File Parsing
- Parse text from PDF, PPTX, DOCX, XLSX/CSV, and images (PNG/JPG)
- Fallback chain: pdf-parse -> Tesseract.js OCR -> LLM vision
- Image OCR and LLM vision parsing
- File classification into course folders via local embeddings (zero API calls)

### Execution
- Shell command execution with abort support and signal handling (SIGTERM -> SIGKILL)

### Web
- Web search via embedded browser (opens Google, reads search results)

### Memory
- Save user observations/preferences to agent memory inbox

## Integrations

### OAuth Connected Accounts
- **Google** — email, drive, calendar (via OAuth or Composio)
- **Microsoft** — Outlook, Teams, OneDrive
- **Zoom** — meeting records
- **Notion** — workspace and database access
- **Slack** — workspace integration with enable/disable and workspace listing
- **Gmail** — direct email access

### Composio Third-Party Toolkits (25 curated)
- **Communication:** Gmail, Slack, Microsoft Outlook, Microsoft Teams
- **Productivity:** Google Sheets, Google Docs, Notion, Asana, Trello, Airtable, Calendly, Cal.com
- **Development:** GitHub, Jira, Linear
- **CRM:** HubSpot, Salesforce
- **Social:** LinkedIn, X (Twitter), Reddit
- **Storage:** Google Drive, Dropbox, OneDrive
- **Support:** Intercom, Zendesk

Each toolkit provides multiple tools (e.g., Gmail: fetch/send/trash/list labels; GitHub: list issues/create PR/repo operations).

### MCP (Model Context Protocol)
- STDIO transport — local command-based MCP servers
- Streamable HTTP transport — HTTP-based MCP servers
- SSE transport — Server-Sent Events fallback
- Server connection management with per-server state tracking (connected/disconnected/error)
- Paginated tool listing and tool execution
- Configuration persistence in `config/mcp.json`

### ScholarOS Account
- OAuth 2.0 + PKCE authentication via ScholarOS website (Clerk-backed)
- LLM proxy to OpenRouter
- Subscription management with billing info retrieval
- Token-based authentication with self-signed HMAC-SHA256 JWTs

## File Export

| Format | Method |
|--------|--------|
| **Markdown (.md)** | Direct file save |
| **PDF** | HTML render -> Chromium `printToPDF` (A4, print backgrounds) |
| **DOCX** | Markdown -> HTML -> `html-to-docx` |
| **PPTX** | PptxGenJS (from scratch) or XML unpack/replace/pack (template editing) |
| **XLSX** | openpyxl Python workflow with formulas, formatting, financial model color coding |
| **HTML** | Self-contained React+Tailwind+shadcn/ui artifacts |

## Voice Features

- **Voice memo recording** — record audio, auto-transcribe via Deepgram, save to `Voice Memos/` folder
- **Text-to-speech** — AI responses synthesized via ElevenLabs
- **Configurable** — Deepgram and ElevenLabs API key settings

## Ingestion & Processing

- **File ingestion** — drag-drop or file picker to stage external files into the vault `raw/` directory
- **Academic pipeline** — PDF ingestion with metadata extraction (title, authors, abstract), course classification via local embeddings, contradiction detection, prerequisite graph construction, annotation processing

## Knowledge Graph & Note Creation

- **Automated note creation agent** — processes source files (emails, meeting transcripts, voice memos) into structured knowledge notes
- **Entity resolution** — resolves people, organizations, projects to canonical names
- **State change detection** — detects project status changes, open item resolution, role/title changes
- **Bidirectional wiki-linking** enforced automatically (concept -> course AND course -> concept)
- **Configurable note types** — Course Concept, Lecture Notes, Assignment, Paper Summary, Synthesis, Resource, Entity — each with custom folder, template, and extraction guide
- **Agent notes system** — separate memory maintenance agent that processes emails, copilot conversations, and inbox entries; maintains `user.md`, `preferences.md`, `style/email.md` with timestamped bullet-point facts and automatic stale fact removal
- **Tag system** — label-based filtering rules determining which emails warrant note creation
- **Knowledge index** — scans all markdown files, builds categorized indexes for courses, concepts, lectures, assignments, papers, syntheses, resources, entities

## Settings

- **Account** — ScholarOS sign-in/out, billing info
- **Connected Accounts** — manage OAuth connections (Google, Microsoft, Zoom, Notion, Slack, Gmail)
- **Models** — LLM provider selection and configuration per category (chat, knowledge graph, meeting notes); hidden when signed into ScholarOS account
- **MCP Servers** — JSON editor for `config/mcp.json`
- **Security** — JSON editor for `config/security.json` (allowed shell commands)
- **Appearance** — theme (Light / Paper / Dark / System), font style (Serif / Sans), font size (Small / Medium / Large)
- **Tools Library** — Composio toolkit browser: search, connect/disconnect tool integrations

## Onboarding (4 Steps)

1. Vault selection (choose folder or demo vault)
2. Theme preference (Light / Paper / Dark / System)
3. LLM provider and model configuration
4. Completion screen with "All set!"

## Embedded Browser

- **Multi-tab browser** within the app
- Navigate, back, forward, reload
- Tab management — create, switch, close tabs
- Position/resize control, show/hide
- Dangerous scheme blocking (javascript:, file:, chrome:)
- State sync to renderer for live UI updates
- Programmatic control via AI copilot (browser-control skill)

## Agent Runs System

- Full lifecycle management: create, stop (graceful then force), abort with SIGKILL/MCP force-close
- Permission authorization flow (approve/deny/always)
- Human-in-the-loop input requests
- Run listing with pagination, deletion, clear-all
- Message queue with event streaming (streaming LLM deltas, tool invocations, errors)
- Sub-flow spawning capability

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open Command Palette (search + quick compose) |
| `Cmd+L` | Toggle full-screen chat / restore two-pane view |
| `Cmd+W` | Close active tab (file or chat) |
| `Cmd+1` through `Cmd+9` | Switch to tab 1-9 |
| `Cmd+Shift+]` | Next tab |
| `Cmd+Shift+[` | Previous tab |
| `Cmd+Z` | Undo (in markdown editor) |
| `Cmd+Shift+Z` / `Cmd+Y` | Redo (in markdown editor) |

## System

- **Command Palette** (Cmd+K) — unified search across knowledge files and chat history with quick AI message compose
- **Two-pane layout** — center content + right chat sidebar; toggleable to full-screen chat
- **Sidebar toggle** — show/hide left file tree
- **Electron version info** — Chrome, Node.js, Electron versions
- **App restart** capability
- **Slack workspace discovery** via `agent-slack` CLI
- **Local development server** for serving app content
