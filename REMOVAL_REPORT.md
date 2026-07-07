# Feature Removal Report — Composio, Fireflies, Email/Gmail, Slack

Date: 2026-07-08
Author: AI coding agent

## Context

ScholarOS is an academic-only Electron desktop app. These four features provided integrations with third-party B2B services (Gmail, GitHub, Slack, Notion, Fireflies, etc.) that are irrelevant to the academic use case. All were removed to eliminate dead code and reduce maintenance burden.

## Stats

| Metric | Value |
|--------|-------|
| Files deleted | 14 |
| Files edited | 22 |
| Lines removed | 3,692 |
| Lines added | 52 |
| Net reduction | −3,640 lines |
| npm deps removed | `@composio/core` |

---

## 1. Composio Integration

Composio is a B2B integration platform (competitor to Nango/Merge.dev). It provided OAuth-based connections to 25+ SaaS services plus an AI agent toolkit. None of these are needed for an academic app.

### Files Deleted

| File | Lines | Description |
|------|-------|-------------|
| `packages/core/src/composio/types.ts` | 257 | Zod schemas for Composio API — toolkits, auth configs, connected accounts, tool search, action execution |
| `packages/core/src/composio/client.ts` | 323 | HTTP client to `backend.composio.dev/api/v3` — searchTools, executeAction, listToolkits, createConnectedAccount, etc. |
| `packages/core/src/composio/repo.ts` | 155 | File-based local storage for connected account state (`connected_accounts.json`) |
| `packages/core/src/composio/index.ts` | 5 | Barrel export |
| `packages/shared/src/composio.ts` | 77 | `CURATED_TOOLKITS` (25 SaaS entries: Gmail, Slack, GitHub, Notion, etc.), shared Zod schemas |
| `packages/core/src/application/assistant/skills/composio-integration/skill.ts` | 126 | LLM skill prompt teaching the AI how to use Composio tools |
| `apps/main/src/composio-handler.ts` | 350 | Electron main process IPC handler — registered 10 channels |
| `apps/renderer/src/components/composio-api-key-modal.tsx` | 94 | Settings modal for entering Composio API key (BYOK mode) |
| `apps/renderer/src/components/ai-elements/composio-connect-card.tsx` | 127 | In-chat UI card for OAuth connection flow |

### Files Edited

| File | Change |
|------|--------|
| `packages/core/package.json` | Removed `@composio/core` dependency |
| `packages/shared/src/index.ts` | Removed `export * as composio` |
| `packages/shared/src/ipc.ts` | Removed all 10 composio channel schemas |
| `packages/shared/src/service-events.ts` | Removed unused services (`gmail`, `fireflies`, `agent_notes`) |
| `apps/main/src/ipc.ts` | Removed composio import + 10 `ipcMain.handle()` registrations |
| `packages/core/src/application/lib/builtin-tools.ts` | Removed imports (`composioAccountsRepo`, `executeComposioAction`, etc.) + 4 tool definitions (`composio-list-toolkits`, `composio-search-tools`, `composio-execute-tool`, `composio-connect-toolkit`) |
| `packages/core/src/application/assistant/instructions.ts` | Removed composio imports, types, tool build logic, all 4 tool entries |
| `packages/core/src/application/assistant/skills/index.ts` | Removed `composio-integration` import + definition |
| `packages/core/src/application/assistant/skills/mcp-integration/skill.ts` | Removed "Composio takes priority over MCP" section |
| `packages/core/src/application/assistant/modules/builtin-tools-reference.ts` | Removed composio + Slack lines |
| `apps/renderer/src/App.tsx` | Removed composio import, `handleComposioConnected`, rendering, `onComposioConnected` prop |
| `apps/renderer/src/components/chat-sidebar.tsx` | Removed composio import, prop, rendering |
| `apps/renderer/src/lib/chat-conversation.ts` | Removed `ComposioConnectCardData`, `ComposioActionCardData` types + card rendering |
| `apps/renderer/src/components/onboarding-modal.tsx` | Removed composio/gmail sections, state, handlers, imports |
| `apps/renderer/src/components/onboarding/steps/connect-accounts-step.tsx` | Removed composio/gmail section |
| `apps/renderer/src/hooks/useConnectors.ts` | Removed `composioApiKeyOpen`, `composioApiKeySubmit`, Slack state/handlers |
| `apps/renderer/src/components/connectors-popover.tsx` | Removed `ComposioApiKeyModal` import + JSX |
| `apps/renderer/src/components/settings-dialog.tsx` | Removed `ToolsLibrarySettings` component (~300 lines) + "tools" tab from `ConfigTab` type + tab entry + switch branch |

---

## 2. Fireflies.ai (Meeting Notes)

Fireflies is a meeting transcript service. The app had an OAuth provider registered but no backend processor ever existed — the `sync_fireflies.ts` file was never created.

### Files Edited

| File | Change |
|------|--------|
| `packages/core/src/auth/providers.ts` | Removed `fireflies-ai` OAuth provider config (issuer-based DCR with scope `profile`, `email`) |

### Impact

- The OAuth provider entry was dead — it could never successfully connect since no backend handled the callback.
- The UI previously rendered a `Mic` icon + "Meeting Notes" section in connected-accounts settings; this was also removed.

---

## 3. Email/Gmail System (agent_notes)

The agent_notes system was designed to:
1. Scan Gmail sync directory for emails the user sent
2. Read `save-to-memory` inbox entries
3. Scan recent copilot conversations
4. Feed all source material to a dedicated agent that updates `user.md`, `preferences.md`, and `style/email.md`

It was disabled at startup (`console.log("[AgentNotes] Service disabled in student vault mode")`) and never ran in production.

### Files Deleted

| File | Lines | Description |
|------|-------|-------------|
| `packages/core/src/knowledge/agent_notes.ts` | 364 | Main processing loop — email scanning, inbox reading, copilot run scanning, agent orchestration |
| `packages/core/src/knowledge/agent_notes_agent.ts` | 105 | Agent definition with YAML frontmatter + system prompt for memory maintenance |
| `packages/core/src/knowledge/agent_notes_state.ts` | 67 | State persistence (processed emails, runs, last run time) |
| `apps/renderer/src/components/google-client-id-modal.tsx` | 129 | Settings modal for Gmail OAuth client ID entry |
| `apps/renderer/src/lib/google-credentials-store.ts` | 23 | localStorage helper for Google credentials |

### Files Edited

| File | Change |
|------|--------|
| `packages/core/src/config/config.ts` | Removed `"agent-notes"`, `"gmail_sync"`, `"agent_notes_state.json"` from `SCHOLAROS_INTERNAL_TOP_LEVEL_NAMES` |
| `packages/core/src/agents/runtime.ts` | Removed `loadAgentNotesContext()` stub (returned `null`) + its caller |
| `apps/renderer/src/hooks/useConnectors.ts` | Removed `googleClientIdOpen`, `googleClientIdDescription`, `handleGoogleClientIdSubmit`, Google-specific reconnect case |
| `apps/renderer/src/components/connectors-popover.tsx` | Removed `GoogleClientIdModal` import + JSX, Google reconnect handler |
| `apps/renderer/src/components/settings/connected-accounts-settings.tsx` | Removed `GoogleClientIdModal` + `ComposioApiKeyModal` imports, email/fireflies sections, Google reconnect handler |

---

## 4. Slack (Transitive — depended on Composio)

Slack integration required Composio (`composioAccountsRepo.isConnected("slack")`). Since Composio is removed, Slack tools are also dead.

| File | Change |
|------|--------|
| `apps/renderer/src/hooks/useConnectors.ts` | Removed all Slack state: `slackEnabled`, `slackLoading`, `slackWorkspaces`, `slackAvailableWorkspaces`, `slackSelectedUrls`, `slackPickerOpen`, `slackDiscovering`, `slackDiscoverError`, `handleSlackEnable`, `handleSlackSaveWorkspaces`, `handleSlackDisable`, `refreshSlackConfig` |
| `packages/core/src/application/assistant/modules/builtin-tools-reference.ts` | Removed line about `slack-checkConnection` / `slack-listAvailableTools` / `slack-executeAction` |

---

## Build Verification

```
packages/shared  ✅ tsc
packages/core    ✅ tsc
apps/preload     ✅ tsc + esbuild
apps/main        ✅ tsc + esbuild bundle
apps/renderer    ✅ tsc -b + vite build
```

All packages compile cleanly. The 26 renderer TypeScript errors are pre-existing (`TS18048: 'window.ipc' is possibly undefined` in `App.tsx`) and unrelated to these changes.
