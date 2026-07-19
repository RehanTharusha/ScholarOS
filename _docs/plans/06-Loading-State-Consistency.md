# Plan 06: Loading State Consistency

## Problem

The app uses 4+ different loading patterns, making it feel less polished than it should:

| Pattern | Where | Code ref |
|---------|-------|----------|
| `Shimmer` with "Thinking..." | Chat streaming | `App.tsx:6717` |
| `animate-pulse rounded-lg bg-muted/50` | Lazy-loaded views (graph, canvas, PDF) | `App.tsx:187` (ViewFallback) |
| `animate-pulse` bare | Some async sections | Inline |
| Nothing / raw "Loading..." | Some file types, some views | Default behavior |
| Structural loading (stable shell, body only) | Some areas | Per design doc recommendation |

The design doc says (line 214-218):
> Loading states should be calm and structural. Use a neutral loading card or empty-state container. If the screen has a stable shell, show it and replace only the body content.

The code partially follows this (ViewFallback shows a neutral skeleton) but inconsistently. Some areas show nothing while loading, causing layout shift.

## Desired State

Every loading state in the app uses exactly one of two patterns:

1. **Structural loading** — The page shell renders immediately. Body content area shows `LoadingCard` (neutral, minimal pulse). Use for: file loads, graph builds, research sessions.

2. **Inline shimmer** — For streaming content where the container is already visible. Use for: chat response streaming, the existing Shimmer component is fine here.

No more `animate-pulse` inline. No more raw "Loading..." text. No more blank areas while content loads.

## Implementation

### Step 1: Create a `LoadingCard` component

```typescript
// components/ui/loading-card.tsx
interface LoadingCardProps {
  rows?: number;     // number of skeleton lines to show
  variant?: 'card' | 'list' | 'page';
  label?: string;    // optional label shown as subtle text
}
```

Design: neutral `bg-muted/50` rounded-2xl card with 2-3 skeleton lines at `text-sm` height. Subtle pulse animation. No shimmer sweep, no animated gradient — per the design doc's "calm and structural" rule.

```tsx
export function LoadingCard({ rows = 3, variant = 'card', label }: LoadingCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      {label && (
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-muted animate-pulse"
          style={{ width: `${60 + Math.random() * 30}%` }}
        />
      ))}
    </div>
  );
}
```

### Step 2: Replace ViewFallback

Current (App.tsx:185-189):

```tsx
function ViewFallback() {
  return (
    <div className="flex-1 min-h-0 animate-pulse rounded-lg bg-muted/50" />
  );
}
```

Replace with:

```tsx
function ViewFallback({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-8">
      <LoadingCard label={label} variant="page" rows={4} />
    </div>
  );
}
```

### Step 3: Audit every loading path

Search for every place content loads asynchronously:

| Path | Current pattern | Replace with |
|------|----------------|--------------|
| `LazyPdfViewer` | `<React.Suspense fallback={<ViewFallback />}>` | Keep Suspense, use new ViewFallback |
| `LazyGraphView` | Same | Same |
| `LazyCanvasView` | Same | Same |
| File content load | Nothing while loading | Show LoadingCard in the editor area |
| Graph build (`buildGraph` at line 5369) | `setGraphStatus("loading")` but no visible loading UI | Show LoadingCard with label "Building graph..." |
| Onboarding modal load | Nothing | Already synchronous, OK |
| Research start | No loading for research start call | Consider adding LoadingCard if research takes >1s |
| Directory listing | Nothing while tree loads | Show LoadingCard with label "Loading vault..." |
| Run load | Nothing while run loads | Show LoadingCard in chat area |

### Step 4: Handle the graph build loading state

Currently `graphStatus` is set to "loading" but the UI doesn't change until it's "ready" or "error". Add:

```tsx
// In the GraphView rendering (App.tsx:6182-6199)
{isGraphOpen && graphStatus === 'loading' ? (
  <div className="flex-1 min-h-0 flex items-center justify-center">
    <LoadingCard label="Building graph" rows={4} />
  </div>
) : graphStatus === 'error' ? (
  // existing error state
) : (
  // existing graph component
)}
```

### Step 5: Handle file content loading

Currently when `selectedPath` changes, `setFileContent("")` is called (line 1676) then content loads asynchronously. The editor area briefly shows empty. Add:

```typescript
// Track loading state alongside content
const [fileLoadState, setFileLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
```

Show `LoadingCard` when state is 'loading', content when 'loaded', error state when 'error'.

## Files Changed

| File | Change |
|------|--------|
| `components/ui/loading-card.tsx` | **New** component |
| `App.tsx` | Replace ViewFallback, add loading for file loads, graph build |
| `components/chat-sidebar.tsx` | Ensure consistent shimmer during streaming |
| Any view component showing raw "Loading..." | Replace with LoadingCard |

## Verification

1. Navigate to every view while content is loading → see LoadingCard, not blank space or raw text
2. Graph build shows loading state
3. File loads show loading state
4. PDF loads show loading state
5. No `animate-pulse` remains outside of LoadingCard and Shimmer
6. Design doc loading rule is respected everywhere

## Dependencies

- Depends on: nothing (can be done independently)
- Blocks: nothing
