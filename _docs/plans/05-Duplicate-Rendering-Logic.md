# Plan 05: Eliminate Duplicated Conversation Rendering

## Problem

The conversation rendering logic is duplicated in two places:

1. **`App.tsx` lines 5444-5588** — `renderConversationItem()` renders individual messages, tool calls (web search, deep research, generic), and error messages. This is used when the chat is the **main center pane** (no file selected).

2. **`chat-sidebar.tsx` lines 459-611** — `renderConversationItem()` does the same thing, used when the chat is the **right sidebar** (file/graph open in center).

Both functions are nearly identical. They:
- Render the same Message/MessageContent/MessageResponse structure
- Handle the same item types (chat message, web search, deep research, error)
- Use the same streamdown components and remark plugins
- Apply the same billing error matching

The grouping logic (`groupConversationItems` for tool call grouping) is also duplicated — used both in App.tsx (~line 6494) and chat-sidebar.tsx (~line 752).

**Impact:** If you fix a bug in one (e.g., the attachment rendering), you'll miss the other. If you add a new message type (e.g., code execution cards), you must add it twice.

## Desired State

A single `ConversationRenderer` component in the shared ai-elements directory. Both the main chat view and the sidebar chat view import and use it.

## Implementation Steps

### Step 1: Create the shared component

```typescript
// apps/renderer/src/components/ai-elements/conversation-renderer.tsx

interface ConversationRendererProps {
  items: ConversationItem[];
  currentAssistantMessage: string;
  currentReasoningMessage: string;
  currentToolDraftActive: boolean;
  isProcessing: boolean;
  allPermissionRequests: Map<string, ToolPermissionRequestEvent>;
  permissionResponses: Map<string, 'approve' | 'deny'>;
  pendingAskHumanRequests: Map<string, AskHumanRequestEvent>;
  onPermissionResponse?: (toolCallId: string, ...) => void;
  onAskHumanResponse?: (toolCallId: string, ...) => void;
  onCopyResearch?: () => void;
  onDeleteResearch?: () => void;
  onDiscussResearch?: () => void;
  onShowResearchInPanel?: () => void;
  onOpenResearchHtml?: () => void;
  onCancelResearch?: () => void;
}
```

This component contains:
- The `groupConversationItems` call
- The item rendering switch (message vs tool-call vs error)
- The streaming state rendering (reasoning, draft, assistant message, thinking shimmer)
- The permission request rendering
- The ask-human request rendering
- The research results rendering

### Step 2: Replace inline rendering in App.tsx

In the "chat as main pane" section (lines 6444-6861):

```tsx
// Before:
{(() => {
  const nodes: React.ReactNode[] = [];
  // ... 300 lines of rendering logic
  return nodes;
})()}

// After:
<ConversationRenderer
  items={tabState.conversation}
  currentAssistantMessage={tabState.currentAssistantMessage}
  currentReasoningMessage={tabState.currentReasoningMessage}
  currentToolDraftActive={tabState.currentToolDraftActive}
  isProcessing={isActive && isProcessing}
  // ... other props
/>
```

### Step 3: Replace inline rendering in chat-sidebar.tsx

In the sidebar chat (lines 750-941):

```tsx
// Same replacement
<ConversationRenderer ... />
```

### Step 4: Remove duplicated helper functions

- Remove the duplicate `renderConversationItem` from both files
- Remove the duplicate `SmoothStreamingMessage` (defined in both files, lines 199-210 and 79-90)
- Remove the duplicate `userMessageRemarkPlugins` (both files)
- Remove the duplicate `streamdownComponents` (both files)
- Remove the duplicate `matchBillingError` / `BillingErrorCTA` (chat-sidebar.tsx lines 102-150 — also used in App.tsx)

### Step 5: Unify the billing error UI

`BillingErrorCTA` is defined in chat-sidebar.tsx (lines 130-150) but the billing-error matching should logically be in the shared renderer. Move it there.

## Files Changed

| File | Change |
|------|--------|
| `apps/renderer/src/components/ai-elements/conversation-renderer.tsx` | **New** — shared rendering |
| `apps/renderer/src/App.tsx` | Remove lines 173-197 (streamdown/plugins), 5444-5588 (renderConversationItem) |
| `apps/renderer/src/components/chat-sidebar.tsx` | Remove lines 77-98 (streamdown/plugins), 102-150 (billing errors), 459-611 (renderConversationItem) |

## Verification

1. Main chat view renders identically to before
2. Sidebar chat view renders identically to before
3. Billing errors appear in both views
4. Permission requests appear in both views
5. Deep research progress/complete renders in both views
6. All motion animations (fade-in, stagger) are preserved
7. `npm run lint` passes

## Dependencies

- Depends on: [02-Break-Up-App-Tsx.md](02-Break-Up-App-Tsx.md) (the shared component should live inside ChatContext's files, so do this after ChatContext extraction)
- Blocks: nothing
