# Plan 07: Empty States

## Problem

The design doc is explicit about empty states (lines 222-226):

> Empty states should explain what the user should do next.
> - Title: concise and direct.
> - Description: one sentence describing why the state exists.
> - Action: a single primary next step if applicable.

But not all views follow this:

| View | Current empty behavior | Problem |
|------|----------------------|---------|
| Chat (main pane) | Greeting component + Suggestions + RecentItems | Actually good! |
| Chat (sidebar) | "Ask anything..." text | Minimal, no action button |
| File tree (empty vault) | Nothing rendered | Blank sidebar |
| File editor (no file) | Renders the chat view | Confusing — user might be looking for a note |
| Graph view | "Loading..." or error | No empty state for vault with no wiki-links |
| Canvas view | Empty canvas | Acceptable (canvas is always editable) |
| Calendar view | Empty calendar | Acceptable |
| Bases view | Empty table | A "No notes yet" row would help |
| Artifacts view | Empty grid | No clear "what to do here" message |
| Version history | Nothing shown | Acceptable (toggled on demand) |
| RecentItems | Hidden when `scholaros-show-recent-items` is false | Good |
| Ingest window | Initial state | Could explain what to do |

## Desired State

Every content view has an `AcademicEmptyState` (or equivalent) that:
1. Shows when there's nothing to display
2. Explains what the user *could* do in one sentence
3. Provides a primary action button
4. Uses the standard empty-state visual language

## Implementation

### Step 1: Audit and create empty state content

Create a mapping of view → empty state content:

| View | Title | Description | Action |
|------|-------|-------------|--------|
| File tree (no vault) | "No vault selected" | "Choose a folder to use as your knowledge workspace." | "Select Vault" button |
| File tree (empty vault) | "Your vault is empty" | "Create your first note to get started." | "New Note" button |
| Graph view | "No connections yet" | "Create notes with [[wiki-links]] to see them here." | "New Note" button |
| Bases view | "No matching notes" | "Notes with the selected filters will appear here." | "Create Note" button |
| Artifacts view | "No artifacts found" | "Generated documents and exports appear here." | — |
| Chat sidebar (empty tab) | Currently "Ask anything..." | Keep, just add a subtle "New chat" button | "New Chat" button |
| Research panel | "Start a deep research session" | "Explore any topic with multi-round AI research." | "New Research" |

### Step 2: Add empty state to GraphView

File: `apps/renderer/src/components/graph-view.tsx`

When graph has 0 nodes:

```tsx
{graphData.nodes.length === 0 ? (
  <AcademicEmptyState
    title="No connections yet"
    description="Create notes with [[wiki-links]] to see them here."
    action={
      <Button onClick={onNewNote}>Create Note</Button>
    }
  />
) : (
  // existing graph rendering
)}
```

### Step 3: Add empty state to file tree

File: `apps/renderer/src/components/sidebar-content.tsx`

When tree is empty and vault exists:

```tsx
{tree.length === 0 ? (
  <div className="p-4 text-center">
    <p className="text-sm text-muted-foreground">Your vault is empty</p>
    <Button size="sm" className="mt-2" onClick={knowledgeActions.createNote}>
      New Note
    </Button>
  </div>
) : (
  // existing tree rendering
)}
```

### Step 4: Add empty state to BasesView

File: `apps/renderer/src/components/bases-view.tsx`

When filtered results are empty:

```tsx
{filteredNotes.length === 0 ? (
  <AcademicEmptyState
    title="No matching notes"
    description={
      hasFilters
        ? "Try adjusting your filters."
        : "Create notes to see them here."
    }
    action={
      !hasFilters ? (
        <Button onClick={onCreateNote}>Create Note</Button>
      ) : undefined
    }
  />
) : (
  // existing table rendering
)}
```

### Step 5: Add empty state to ArtifactsView

File: `apps/renderer/src/components/artifacts-view.tsx`

```tsx
{artifacts.length === 0 ? (
  <AcademicEmptyState
    title="No artifacts yet"
    description="Generated documents and exports will appear here."
  />
) : (
  // existing grid rendering
)}
```

## Verification

1. Open app with empty vault → see "Your vault is empty" + "New Note" button
2. Open graph with no wiki-links → see "No connections yet" + "Create Note" button
3. Open bases with filters that match nothing → see "No matching notes"
4. Open artifacts with no exports → see "No artifacts yet"
5. Existing non-empty views are unaffected
6. Design doc's empty-state rule is followed in every view

## Dependencies

- Depends on: nothing (can be done independently)
- Blocks: nothing
