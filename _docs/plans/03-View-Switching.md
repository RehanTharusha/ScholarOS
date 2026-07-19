# Plan 03: Replace Boolean-Flag View Switching with a State Reducer

## Problem

View state is tracked as a collection of mutually-exclusive boolean flags. In `App.tsx`:

```typescript
const [isGraphOpen, setIsGraphOpen] = useState(false);
const [isBrowserOpen, setIsBrowserOpen] = useState(false);
const [isSuggestedTopicsOpen, setIsSuggestedTopicsOpen] = useState(false);
const [isArtifactsOpen, setIsArtifactsOpen] = useState(false);
const [isCanvasesOpen, setIsCanvasesOpen] = useState(false);
const [isCanvasOpen, setIsCanvasOpen] = useState(false);
const [isCalendarOpen, setIsCalendarOpen] = useState(false);
const [isReviewOpen, setIsReviewOpen] = useState(false);
const [selectedPath, setSelectedPath] = useState<string | null>(null);
const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true);
const [isRightPaneMaximized, setIsRightPaneMaximized] = useState(false);
const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
const [isSearchOpen, setIsSearchOpen] = useState(false);
const [isFocusMode, setIsFocusMode] = useState(false);
```

Every navigation function must carefully toggle these in the right combination. For example, `navigateToView` at line 4206 and `switchFileTab` at line 3618 each set 10+ flags manually. One missed flag produces a weird state that's hard to reproduce or debug.

**Example brittle code** — `switchFileTab` (line 3618):
```typescript
// This function has 15+ flag assignments and 8 conditional branches
setSelectedPath(null);
setIsGraphOpen(true);
setIsSuggestedTopicsOpen(false);
setIsArtifactsOpen(false);
setIsCanvasesOpen(false);
// ... plus more in each branch
```

If a new view type is added (e.g., `isKanbanOpen`), every switching function needs updating.

## Desired State

A single `ViewState` type (already partially defined at line 591) drives all view rendering. Navigation is a dispatch to a reducer, not manual flag toggling.

```typescript
// Central, canonical view state
type ViewState =
  | { type: "chat"; runId: string | null }
  | { type: "file"; path: string }
  | { type: "graph" }
  | { type: "suggested-topics" }
  | { type: "artifacts" }
  | { type: "canvases" }
  | { type: "canvas"; path: string }
  | { type: "calendar" }
  | { type: "browser" };

// Layout modifiers (orthogonal to view state)
type LayoutState = {
  mainView: ViewState;
  isRightSidebarOpen: boolean;
  isRightSidebarMaximized: boolean;
  isLeftSidebarOpen: boolean;
  isSearchOpen: boolean;
  isFocusMode: boolean;
  isReviewOpen: boolean;
};
```

## Implementation Steps

### Step 1: Define the canonical ViewState and LayoutState

Add to `apps/renderer/src/lib/navigation.ts`:

```typescript
export type ViewState =
  | { type: "chat"; runId: string | null }
  | { type: "file"; path: string }
  | { type: "graph" }
  | { type: "suggested-topics" }
  | { type: "artifacts" }
  | { type: "canvases" }
  | { type: "canvas"; path: string }
  | { type: "calendar" }
  | { type: "browser" };

export type LayoutState = {
  mainView: ViewState;
  isRightSidebarOpen: boolean;
  isRightSidebarMaximized: boolean;
  isLeftSidebarOpen: boolean;
  isSearchOpen: boolean;
  isFocusMode: boolean;
  isReviewOpen: boolean;
};
```

### Step 2: Create a navigation reducer

In the same file:

```typescript
type NavigationAction =
  | { type: "NAVIGATE_TO"; view: ViewState }
  | { type: "NAVIGATE_BACK" }
  | { type: "NAVIGATE_FORWARD" }
  | { type: "TOGGLE_RIGHT_SIDEBAR" }
  | { type: "TOGGLE_LEFT_SIDEBAR" }
  | { type: "MAXIMIZE_RIGHT_SIDEBAR" }
  | { type: "RESTORE_SPLIT_VIEW" }
  | { type: "TOGGLE_SEARCH" }
  | { type: "TOGGLE_FOCUS_MODE" }
  | { type: "TOGGLE_REVIEW" };
```

The reducer handles all the flag coordination logic in one place:

```typescript
function navigationReducer(state: LayoutState, action: NavigationAction): LayoutState {
  switch (action.type) {
    case "NAVIGATE_TO":
      // If navigating to a file/graph/etc. and right sidebar context applies
      // If navigating to chat, restore previous view from expandedFrom
      // Handle maximized state transitions
      return computeNewState(state, action.view);
    case "TOGGLE_RIGHT_SIDEBAR":
      return { ...state, isRightSidebarOpen: !state.isRightSidebarOpen };
    // etc.
  }
}
```

### Step 3: Extract NavigationContext

Create `apps/renderer/src/contexts/navigation-context.tsx`:

```typescript
interface NavigationContextValue {
  layout: LayoutState;
  navigateTo: (view: ViewState) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  toggleRightSidebar: () => void;
  toggleLeftSidebar: () => void;
  toggleMaximized: () => void;
  toggleSearch: () => void;
  toggleFocusMode: () => void;
}
```

### Step 4: Replace scattered booleans in rendering

The render switch in App.tsx (lines 6104-6861) changes from:

```tsx
{isBrowserOpen ? <BrowserPane /> : isArtifactsOpen ? <ArtifactsView /> : ...}
```

To:

```tsx
<ViewRouter view={layout.mainView} />
```

Where `ViewRouter` matches on the single `viewState.type`.

### Step 5: Remove all `is*Open` state variables

After the context is in place:
1. Delete all 14 `useState` declarations for view flags (lines 721-761)
2. Replace all direct `setIsGraphOpen(true)` calls with `navigateTo({ type: "graph" })`
3. Remove `expandedFrom` state (track it inside the reducer)
4. Remove `setActiveShortcutPane` (derive it from view type)

## Safety Net

During migration, add a runtime assertion that catches inconsistent state:

```typescript
function assertConsistentViewState(state: LayoutState) {
  const view = state.mainView;
  // Only one view type should be active
  const activeTypes = [view.type];
  // If file is selected, graph/canvas/etc should not be showing
  // etc.
}
```

Run this in development mode after every dispatch.

## Verification

1. All navigation paths work: file→graph, graph→chat, chat→full-screen chat, file+toggle sidebar, etc.
2. No `setIs*` calls remain in App.tsx (except `useReducer` dispatch)
3. Back/forward navigation still works correctly
4. Focus mode still collapses sidebars
5. Right-pane maximize still works
6. The reducer test can be unit-tested without React

## Dependencies

- Blocks: nothing directly
- Depends on: [02-Break-Up-App-Tsx.md](02-Break-Up-App-Tsx.md) (should be done within NavigationContext extraction)
- Related: [04-State-Management-Scope.md](04-State-Management-Scope.md)
