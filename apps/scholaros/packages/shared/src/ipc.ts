import { z } from "zod";
import {
  RelPath,
  Encoding,
  Stat,
  DirEntry,
  ReaddirOptions,
  ReadFileResult,
  WorkspaceChangeEvent,
  WriteFileOptions,
  WriteFileResult,
  RemoveOptions,
} from "./workspace.js";
import { ListToolsResponse } from "./mcp.js";
import {
  AskHumanResponsePayload,
  CreateRunOptions,
  Run,
  ListRunsResponse,
  ToolPermissionAuthorizePayload,
} from "./runs.js";
import { LlmModelConfig } from "./models.js";
import { ServiceEvent } from "./service-events.js";

import { UserMessageContent } from "./message.js";
import { ScholarOSApiConfig } from "./scholaros-account.js";
import { ZListToolkitsResponse } from "./composio.js";
import { BrowserStateSchema } from "./browser-control.js";
import { ResearchQuery, ResearchProgress, ResearchSession } from "./research.js";
// ============================================================================
// Runtime Validation Schemas (Single Source of Truth)
// ============================================================================

const ipcSchemas = {
  "app:getVersions": {
    req: z.null(),
    res: z.object({
      chrome: z.string(),
      node: z.string(),
      electron: z.string(),
    }),
  },
  "workspace:getRoot": {
    req: z.null(),
    res: z.object({
      root: z.string(),
    }),
  },
  "workspace:exists": {
    req: z.object({
      path: RelPath,
    }),
    res: z.object({
      exists: z.boolean(),
    }),
  },
  "workspace:stat": {
    req: z.object({
      path: RelPath,
    }),
    res: Stat,
  },
  "workspace:readdir": {
    req: z.object({
      path: z.string(), // Empty string allowed for root directory
      opts: ReaddirOptions.optional(),
    }),
    res: z.array(DirEntry),
  },
  "workspace:readFile": {
    req: z.object({
      path: RelPath,
      encoding: Encoding.optional(),
    }),
    res: ReadFileResult,
  },
  "workspace:writeFile": {
    req: z.object({
      path: RelPath,
      data: z.string(),
      opts: WriteFileOptions.optional(),
    }),
    res: WriteFileResult,
  },
  "workspace:mkdir": {
    req: z.object({
      path: RelPath,
      recursive: z.boolean().optional(),
    }),
    res: z.object({
      ok: z.literal(true),
    }),
  },
  "workspace:rename": {
    req: z.object({
      from: RelPath,
      to: RelPath,
      overwrite: z.boolean().optional(),
    }),
    res: z.object({
      ok: z.literal(true),
    }),
  },
  "workspace:copy": {
    req: z.object({
      from: RelPath,
      to: RelPath,
      overwrite: z.boolean().optional(),
    }),
    res: z.object({
      ok: z.literal(true),
    }),
  },
  "workspace:remove": {
    req: z.object({
      path: RelPath,
      opts: RemoveOptions.optional(),
    }),
    res: z.object({
      ok: z.literal(true),
    }),
  },
  "workspace:didChange": {
    req: WorkspaceChangeEvent,
    res: z.null(),
  },
  "workspace:convertToHtml": {
    req: z.object({
      path: RelPath,
    }),
    res: z.object({
      html: z.string(),
    }),
  },
  "vault:changed": {
    req: z.object({
      path: z.string(),
    }),
    res: z.null(),
  },
  "mcp:listTools": {
    req: z.object({
      serverName: z.string(),
      cursor: z.string().optional(),
    }),
    res: ListToolsResponse,
  },
  "mcp:executeTool": {
    req: z.object({
      serverName: z.string(),
      toolName: z.string(),
      input: z.record(z.string(), z.unknown()),
    }),
    res: z.object({
      result: z.unknown(),
    }),
  },
  "runs:create": {
    req: CreateRunOptions,
    res: Run,
  },
  "runs:createMessage": {
    req: z.object({
      runId: z.string(),
      message: UserMessageContent,
      voiceInput: z.boolean().optional(),
      voiceOutput: z.enum(["summary", "full"]).optional(),
      searchEnabled: z.boolean().optional(),
      middlePaneContext: z
        .discriminatedUnion("kind", [
          z.object({
            kind: z.literal("file"),
            path: z.string(),
            content: z.string().optional(),
          }),
          z.object({
            kind: z.literal("note"),
            path: z.string(),
            content: z.string(),
          }),
          z.object({
            kind: z.literal("browser"),
            url: z.string(),
            title: z.string(),
          }),
        ])
        .optional(),
    }),
    res: z.object({
      messageId: z.string(),
    }),
  },
  "runs:appendMessage": {
    req: z.object({
      runId: z.string(),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
    res: z.object({
      messageId: z.string(),
    }),
  },
  "runs:authorizePermission": {
    req: z.object({
      runId: z.string(),
      authorization: ToolPermissionAuthorizePayload,
    }),
    res: z.object({
      success: z.literal(true),
    }),
  },
  "runs:provideHumanInput": {
    req: z.object({
      runId: z.string(),
      reply: AskHumanResponsePayload,
    }),
    res: z.object({
      success: z.literal(true),
    }),
  },
  "runs:stop": {
    req: z.object({
      runId: z.string(),
      force: z.boolean().optional().default(false),
    }),
    res: z.object({
      success: z.literal(true),
    }),
  },
  "runs:fetch": {
    req: z.object({
      runId: z.string(),
    }),
    res: Run,
  },
  "runs:list": {
    req: z.object({
      cursor: z.string().optional(),
    }),
    res: ListRunsResponse,
  },
  "runs:delete": {
    req: z.object({
      runId: z.string(),
    }),
    res: z.object({ success: z.boolean() }),
  },
  "runs:deleteAll": {
    req: z.null(),
    res: z.object({ success: z.boolean() }),
  },
  "runs:events": {
    req: z.null(),
    res: z.null(),
  },
  "services:events": {
    req: ServiceEvent,
    res: z.null(),
  },
  "models:list": {
    req: z.null(),
    res: z.object({
      providers: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          models: z.array(
            z.object({
              id: z.string(),
              name: z.string().optional(),
              release_date: z.string().optional(),
            }),
          ),
        }),
      ),
      lastUpdated: z.string().optional(),
    }),
  },
  "models:test": {
    req: LlmModelConfig,
    res: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
  },
  "models:saveConfig": {
    req: LlmModelConfig,
    res: z.object({
      success: z.literal(true),
    }),
  },
  "models:list-opencode": {
    req: z.object({
      flavor: z.enum(["opencode-zen", "opencode-go"]),
      apiKey: z.string().optional(),
    }),
    res: z.object({
      providers: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          models: z.array(
            z.object({
              id: z.string(),
              name: z.string().optional(),
            }),
          ),
        }),
      ),
    }),
  },
  "oauth:connect": {
    req: z.object({
      provider: z.string(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
    }),
    res: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
  },
  "oauth:disconnect": {
    req: z.object({
      provider: z.string(),
    }),
    res: z.object({
      success: z.boolean(),
    }),
  },
  "oauth:list-providers": {
    req: z.null(),
    res: z.object({
      providers: z.array(z.string()),
    }),
  },
  "oauth:getState": {
    req: z.null(),
    res: z.object({
      config: z.record(
        z.string(),
        z.object({
          connected: z.boolean(),
          error: z.string().nullable().optional(),
          userId: z.string().optional(),
          clientId: z.string().nullable().optional(),
        }),
      ),
    }),
  },
  "account:getAccount": {
    req: z.null(),
    res: z.object({
      signedIn: z.boolean(),
      accessToken: z.string().nullable(),
      config: ScholarOSApiConfig.nullable(),
    }),
  },
  "oauth:didConnect": {
    req: z.object({
      provider: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
      userId: z.string().optional(),
    }),
    res: z.null(),
  },
  "slack:getConfig": {
    req: z.null(),
    res: z.object({
      enabled: z.boolean(),
      workspaces: z.array(z.object({ url: z.string(), name: z.string() })),
    }),
  },
  "slack:setConfig": {
    req: z.object({
      enabled: z.boolean(),
      workspaces: z.array(z.object({ url: z.string(), name: z.string() })),
    }),
    res: z.object({
      success: z.literal(true),
    }),
  },
  "slack:listWorkspaces": {
    req: z.null(),
    res: z.object({
      workspaces: z.array(z.object({ url: z.string(), name: z.string() })),
      error: z.string().optional(),
    }),
  },
  "onboarding:getStatus": {
    req: z.null(),
    res: z.object({
      showOnboarding: z.boolean(),
      devOverride: z.boolean().optional(),
    }),
  },
  "onboarding:markComplete": {
    req: z.null(),
    res: z.object({
      success: z.literal(true),
    }),
  },
  "onboarding:reset": {
    req: z.null(),
    res: z.object({
      success: z.literal(true),
    }),
  },
  // Composio integration channels
  "composio:is-configured": {
    req: z.null(),
    res: z.object({
      configured: z.boolean(),
    }),
  },
  "composio:set-api-key": {
    req: z.object({
      apiKey: z.string(),
    }),
    res: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
  },
  "composio:initiate-connection": {
    req: z.object({
      toolkitSlug: z.string(),
    }),
    res: z.object({
      success: z.boolean(),
      redirectUrl: z.string().optional(),
      connectedAccountId: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  "composio:get-connection-status": {
    req: z.object({
      toolkitSlug: z.string(),
    }),
    res: z.object({
      isConnected: z.boolean(),
      status: z.string().optional(),
    }),
  },
  "composio:sync-connection": {
    req: z.object({
      toolkitSlug: z.string(),
      connectedAccountId: z.string(),
    }),
    res: z.object({
      status: z.string(),
    }),
  },
  "composio:disconnect": {
    req: z.object({
      toolkitSlug: z.string(),
    }),
    res: z.object({
      success: z.boolean(),
    }),
  },
  "composio:list-connected": {
    req: z.null(),
    res: z.object({
      toolkits: z.array(z.string()),
    }),
  },
  "composio:use-composio-for-google": {
    req: z.null(),
    res: z.object({
      enabled: z.boolean(),
    }),
  },
  "composio:didConnect": {
    req: z.object({
      toolkitSlug: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    }),
    res: z.null(),
  },
  // Composio Tools Library channels
  "composio:list-toolkits": {
    req: z.object({}),
    res: ZListToolkitsResponse,
  },
  // Shell integration channels
  "shell:openPath": {
    req: z.object({ path: z.string() }),
    res: z.object({ error: z.string().optional() }),
  },
  "shell:revealInFolder": {
    req: z.object({ path: z.string() }),
    res: z.object({ success: z.literal(true) }),
  },
  "shell:readFileBase64": {
    req: z.object({ path: z.string() }),
    res: z.object({ data: z.string(), mimeType: z.string(), size: z.number() }),
  },
  // Ingestion channels
  "ingest:addFiles": {
    req: z.object({
      files: z.array(z.string()).default([]),
      folders: z.array(z.string()).optional(),
    }),
    res: z.object({
      ok: z.literal(true),
      stagedFiles: z.array(
        z.object({
          sourcePath: z.string(),
          targetPath: z.string(),
          name: z.string(),
          size: z.number().optional(),
          sourceFolder: z.string().optional(),
        }),
      ),
      errors: z.array(z.string()),
    }),
  },
  "ingest:pickFolder": {
    req: z.null(),
    res: z.object({
      paths: z.array(z.string()),
      cancelled: z.boolean(),
    }),
  },
  "ingest:watchRaw": {
    req: z.object({
      enabled: z.boolean(),
    }),
    res: z.object({
      ok: z.boolean(),
    }),
  },
  "ingest:rawFileEvent": {
    req: z.object({
      files: z.array(
        z.object({
          sourcePath: z.string(),
          targetPath: z.string(),
          name: z.string(),
          size: z.number().optional(),
          sourceFolder: z.string().optional(),
        }),
      ),
    }),
    res: z.null(),
  },
  // Knowledge version history channels
  "knowledge:history": {
    req: z.object({ path: RelPath }),
    res: z.object({
      commits: z.array(
        z.object({
          oid: z.string(),
          message: z.string(),
          timestamp: z.number(),
          author: z.string(),
        }),
      ),
    }),
  },
  "knowledge:fileAtCommit": {
    req: z.object({ path: RelPath, oid: z.string() }),
    res: z.object({ content: z.string() }),
  },
  "knowledge:restore": {
    req: z.object({ path: RelPath, oid: z.string() }),
    res: z.object({ ok: z.literal(true) }),
  },
  "knowledge:didCommit": {
    req: z.object({}),
    res: z.null(),
  },
  // Search channels
  "search:query": {
    req: z.object({
      query: z.string(),
      limit: z.number().optional(),
      types: z.array(z.enum(["knowledge", "chat"])).optional(),
    }),
    res: z.object({
      results: z.array(
        z.object({
          type: z.enum(["knowledge", "chat"]),
          title: z.string(),
          preview: z.string(),
          path: z.string(),
        }),
      ),
    }),
  },
  // Voice mode channels
  "voice:getConfig": {
    req: z.null(),
    res: z.object({
      deepgram: z.object({ apiKey: z.string() }).nullable(),
      elevenlabs: z
        .object({ apiKey: z.string(), voiceId: z.string().optional() })
        .nullable(),
    }),
  },
  "voice:synthesize": {
    req: z.object({
      text: z.string(),
    }),
    res: z.object({
      audioBase64: z.string(),
      mimeType: z.string(),
    }),
  },
  // Inline task schedule classification
  "export:note": {
    req: z.object({
      markdown: z.string(),
      format: z.enum(["md", "pdf", "docx"]),
      title: z.string(),
    }),
    res: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
  },
  // Embedded browser (WebContentsView) channels
  "browser:setBounds": {
    req: z.object({
      x: z.number().int(),
      y: z.number().int(),
      width: z.number().int().nonnegative(),
      height: z.number().int().nonnegative(),
    }),
    res: z.object({ ok: z.literal(true) }),
  },
  "browser:setVisible": {
    req: z.object({ visible: z.boolean() }),
    res: z.object({ ok: z.literal(true) }),
  },
  "browser:newTab": {
    req: z.object({
      url: z
        .string()
        .min(1)
        .refine(
          (u) => {
            const lower = u.trim().toLowerCase();
            if (lower.startsWith("javascript:")) return false;
            if (lower.startsWith("file://")) return false;
            if (lower.startsWith("chrome://")) return false;
            if (lower.startsWith("chrome-extension://")) return false;
            return true;
          },
          { message: "Unsafe URL scheme" },
        )
        .optional(),
    }),
    res: z.object({
      ok: z.boolean(),
      tabId: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  "browser:switchTab": {
    req: z.object({ tabId: z.string().min(1) }),
    res: z.object({ ok: z.boolean() }),
  },
  "browser:closeTab": {
    req: z.object({ tabId: z.string().min(1) }),
    res: z.object({ ok: z.boolean() }),
  },
  "browser:navigate": {
    req: z.object({
      url: z
        .string()
        .min(1)
        .refine(
          (u) => {
            const lower = u.trim().toLowerCase();
            if (lower.startsWith("javascript:")) return false;
            if (lower.startsWith("file://")) return false;
            if (lower.startsWith("chrome://")) return false;
            if (lower.startsWith("chrome-extension://")) return false;
            return true;
          },
          { message: "Unsafe URL scheme" },
        ),
    }),
    res: z.object({
      ok: z.boolean(),
      error: z.string().optional(),
    }),
  },
  "browser:back": {
    req: z.null(),
    res: z.object({ ok: z.boolean() }),
  },
  "browser:forward": {
    req: z.null(),
    res: z.object({ ok: z.boolean() }),
  },
  "browser:reload": {
    req: z.null(),
    res: z.object({ ok: z.literal(true) }),
  },
  "browser:getState": {
    req: z.null(),
    res: BrowserStateSchema,
  },
  "browser:didUpdateState": {
    req: BrowserStateSchema,
    res: z.null(),
  },
  // Billing channels
  "billing:getInfo": {
    req: z.null(),
    res: z.object({
      userEmail: z.string().nullable(),
      userId: z.string().nullable(),
      subscriptionPlan: z.string().nullable(),
      subscriptionStatus: z.string().nullable(),
      trialExpiresAt: z.string().nullable(),
      sanctionedCredits: z.number(),
      availableCredits: z.number(),
    }),
  },
  // App control channels
  "app:restart": {
    req: z.null(),
    res: z.object({ ok: z.literal(true) }),
  },
  // Vault selection channels (similar to Obsidian's vault switcher)
  "vault:select": {
    req: z.null(),
    res: z.object({
      success: z.boolean(),
      path: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  "vault:getPath": {
    req: z.null(),
    res: z.object({
      path: z.string().nullable(),
    }),
  },
  "vault:setPath": {
    req: z.object({
      path: z.string(),
    }),
    res: z.object({
      success: z.literal(true),
    }),
  },
  // Calendar / Tasks channels
  "calendar:list": {
    req: z.null(),
    res: z.object({
      tasks: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          due: z.string(),
          dueTime: z.string().optional(),
          type: z.enum(["manual", "assignment", "lecture", "deadline", "custom"]),
          status: z.enum(["pending", "done"]),
          source: z.string().optional(),
          description: z.string().optional(),
          createdAt: z.string(),
          updatedAt: z.string(),
          completedAt: z.string().nullable(),
        }),
      ),
    }),
  },
  "calendar:create": {
    req: z.object({
      title: z.string().min(1),
      due: z.string(),
      dueTime: z.string().optional(),
      type: z.enum(["manual", "assignment", "lecture", "deadline", "custom"]),
      source: z.string().optional(),
      description: z.string().optional(),
    }),
    res: z.object({
      task: z.object({
        id: z.string(),
        title: z.string(),
        due: z.string(),
        dueTime: z.string().optional(),
        type: z.enum(["manual", "assignment", "lecture", "deadline", "custom"]),
        status: z.enum(["pending", "done"]),
        source: z.string().optional(),
        description: z.string().optional(),
        createdAt: z.string(),
        updatedAt: z.string(),
        completedAt: z.string().nullable(),
      }),
    }),
  },
  "calendar:complete": {
    req: z.object({ id: z.string() }),
    res: z.object({
      task: z.object({
        id: z.string(),
        title: z.string(),
        due: z.string(),
        dueTime: z.string().optional(),
        type: z.enum(["manual", "assignment", "lecture", "deadline", "custom"]),
        status: z.enum(["pending", "done"]),
        source: z.string().optional(),
        description: z.string().optional(),
        createdAt: z.string(),
        updatedAt: z.string(),
        completedAt: z.string().nullable(),
      }),
    }),
  },
  "calendar:delete": {
    req: z.object({ id: z.string() }),
    res: z.object({ success: z.literal(true) }),
  },
  "calendar:upcoming": {
    req: z.object({ days: z.number().optional() }),
    res: z.object({
      tasks: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          due: z.string(),
          dueTime: z.string().optional(),
          type: z.enum(["manual", "assignment", "lecture", "deadline", "custom"]),
          status: z.enum(["pending", "done"]),
          source: z.string().optional(),
          description: z.string().optional(),
          createdAt: z.string(),
          updatedAt: z.string(),
          completedAt: z.string().nullable(),
        }),
      ),
    }),
  },
  // Knowledge Graph channels
  "knowledge-graph:query": {
    req: z.object({
      query: z.string(),
      limit: z.number().optional(),
    }),
    res: z.object({
      results: z.array(
        z.object({
          nodeId: z.string(),
          nodeName: z.string(),
          path: z.array(z.string()),
          facts: z.array(z.string()),
          score: z.number(),
        }),
      ),
    }),
  },
  "knowledge-graph:getStats": {
    req: z.null(),
    res: z.object({
      totalNodes: z.number(),
      totalFacts: z.number(),
      userBranchNodes: z.number(),
      directivesBranchNodes: z.number(),
      worldBranchNodes: z.number(),
      lastRunTime: z.string().nullable(),
      totalRunsProcessed: z.number(),
      archivedNodes: z.number(),
    }),
  },
  "knowledge-graph:getWarmProfile": {
    req: z.null(),
    res: z.object({
      profile: z
        .object({
          userFacts: z.array(z.string()),
          directivesFacts: z.array(z.string()),
          buildTime: z.string(),
        })
        .nullable(),
    }),
  },
  "knowledge-graph:processNow": {
    req: z.null(),
    res: z.object({
      runsProcessed: z.number(),
      factsExtracted: z.number(),
    }),
  },
  "knowledge-graph:suggestTopics": {
    req: z.null(),
    res: z.object({
      topics: z.array(
        z.object({
          title: z.string(),
          description: z.string(),
          category: z.string().optional(),
          course: z.string().optional(),
        }),
      ),
    }),
  },
  // Wiki-link Knowledge Graph channels
  "knowledge-graph:buildWiki": {
    req: z.object({
      projectPath: z.string().optional(),
    }),
    res: z.object({
      nodes: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          type: z.string(),
          path: z.string(),
          linkCount: z.number(),
          community: z.number(),
        }),
      ),
      edges: z.array(
        z.object({
          source: z.string(),
          target: z.string(),
          weight: z.number(),
        }),
      ),
      communities: z.array(
        z.object({
          id: z.number(),
          nodeCount: z.number(),
          cohesion: z.number(),
          topNodes: z.array(z.string()),
        }),
      ),
    }),
  },
  "knowledge-graph:getInsights": {
    req: z.null(),
    res: z.object({
      surprisingConnections: z.array(
        z.object({
          source: z.object({
            id: z.string(),
            label: z.string(),
            type: z.string(),
            path: z.string(),
            linkCount: z.number(),
            community: z.number(),
          }),
          target: z.object({
            id: z.string(),
            label: z.string(),
            type: z.string(),
            path: z.string(),
            linkCount: z.number(),
            community: z.number(),
          }),
          score: z.number(),
          reasons: z.array(z.string()),
          key: z.string(),
        }),
      ),
      knowledgeGaps: z.array(
        z.object({
          type: z.enum(["isolated-node", "sparse-community", "bridge-node"]),
          title: z.string(),
          description: z.string(),
          nodeIds: z.array(z.string()),
          suggestion: z.string(),
        }),
      ),
    }),
  },
  // Review System channels
  "review:getItems": {
    req: z.object({
      type: z.enum(["contradiction", "duplicate", "missing-page", "confirm", "suggestion"]).optional(),
    }),
    res: z.object({
      items: z.array(
        z.object({
          id: z.string(),
          type: z.enum(["contradiction", "duplicate", "missing-page", "confirm", "suggestion"]),
          title: z.string(),
          description: z.string(),
          sourcePath: z.string().optional(),
          affectedPages: z.array(z.string()).optional(),
          searchQueries: z.array(z.string()).optional(),
          options: z.array(z.object({ label: z.string(), action: z.string() })),
          resolved: z.boolean(),
          resolvedAction: z.string().optional(),
          createdAt: z.number(),
        }),
      ),
    }),
  },
  "review:resolve": {
    req: z.object({
      id: z.string(),
      action: z.string(),
    }),
    res: z.object({
      success: z.boolean(),
    }),
  },
  "review:dismiss": {
    req: z.object({
      id: z.string(),
    }),
    res: z.object({
      success: z.boolean(),
    }),
  },
  "review:clearResolved": {
    req: z.null(),
    res: z.object({
      success: z.boolean(),
    }),
  },
  // Deep Research channels
  "research:start": {
    req: ResearchQuery,
    res: z.object({
      sessionId: z.string(),
    }),
  },
  "research:status": {
    req: z.object({
      sessionId: z.string(),
    }),
    res: z.object({
      progress: ResearchProgress,
      status: z.string(),
    }).nullable(),
  },
  "research:cancel": {
    req: z.object({
      sessionId: z.string(),
    }),
    res: z.object({
      success: z.boolean(),
    }),
  },
  "research:result": {
    req: z.object({
      sessionId: z.string(),
    }),
    res: ResearchSession.nullable(),
  },
  "research:list": {
    req: z.null(),
    res: z.object({
      sessions: z.array(ResearchSession),
    }),
  },
  "research:delete": {
    req: z.object({
      sessionId: z.string(),
    }),
    res: z.object({
      success: z.boolean(),
    }),
  },
  "research:progress": {
    req: z.object({
      sessionId: z.string(),
      progress: ResearchProgress,
      status: z.string(),
    }),
    res: z.null(),
  },
} as const;

// ============================================================================
// Type Helpers
// ============================================================================

export type IPCChannels = {
  [K in keyof typeof ipcSchemas]: {
    req: z.infer<(typeof ipcSchemas)[K]["req"]>;
    res: z.infer<(typeof ipcSchemas)[K]["res"]>;
  };
};

/**
 * Channels that use invoke/handle (request/response pattern)
 * These are channels with non-null responses
 */
export type InvokeChannels = {
  [K in keyof IPCChannels]: IPCChannels[K]["res"] extends null ? never : K;
}[keyof IPCChannels];

/**
 * Channels that use send/on (fire-and-forget pattern)
 * These are channels with null responses (no response expected)
 */
export type SendChannels = {
  [K in keyof IPCChannels]: IPCChannels[K]["res"] extends null ? K : never;
}[keyof IPCChannels];

// ============================================================================
// Type Guards
// ============================================================================

export function validateRequest<K extends keyof IPCChannels>(
  channel: K,
  data: unknown,
): IPCChannels[K]["req"] {
  const schema = ipcSchemas[channel].req;
  return schema.parse(data) as IPCChannels[K]["req"];
}

export function validateResponse<K extends keyof IPCChannels>(
  channel: K,
  data: unknown,
): IPCChannels[K]["res"] {
  const schema = ipcSchemas[channel].res;
  return schema.parse(data) as IPCChannels[K]["res"];
}
