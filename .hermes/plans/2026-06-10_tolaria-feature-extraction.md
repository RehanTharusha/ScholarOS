# Tolaria Feature Extraction Plan

> **Goal:** Extract the most impactful UI/UX features from Tolaria to polish ScholarOS

## HIGH PRIORITY (Phase 1)

### 1. Sort Dropdown for Lists
- Add sort controls to knowledge/chat/canvas lists
- Options: date modified, date created, title, status
- Portal-based dropdown with keyboard navigation
- Files: Create `apps/x/apps/renderer/src/components/sort-dropdown.tsx`

### 2. Tags Dropdown with Create-on-Type
- Rich tag selector with search filtering
- Create new tags inline when typing non-existent tag
- Tag pills with consistent styling
- Files: Create `apps/x/apps/renderer/src/components/tags-dropdown.tsx`

### 3. Table of Contents Panel
- Auto-generated from headings in markdown
- Click to navigate (scrollIntoView)
- Heading level icons, tree structure
- Files: Create `apps/x/apps/renderer/src/components/table-of-contents-panel.tsx`

### 4. Bulk Action Bar
- Floating bar when items are multi-selected
- Actions: archive, delete, tag, clear selection
- Dark inverted color scheme for visibility
- Files: Create `apps/x/apps/renderer/src/components/bulk-action-bar.tsx`

## MEDIUM PRIORITY (Phase 2)

### 5. Command Palette Upgrade
- Add command registry for app-wide actions
- Keyboard shortcut display per command
- Grouped results with section headers
- Files: Modify `apps/x/apps/renderer/src/components/search-dialog.tsx`

### 6. Filter Builder
- Visual filter builder with field/operator/value
- Nested AND/OR groups
- Date picker, regex toggle
- Files: Create `apps/x/apps/renderer/src/components/filter-builder.tsx`

### 7. Dynamic Properties Panel
- Frontmatter/property editing panel
- Smart display modes (date, URL, status, tags)
- Type-derived properties
- Files: Create `apps/x/apps/renderer/src/components/dynamic-properties-panel.tsx`

## DESIGN SYSTEM (Phase 3)

### 8. Warm Dark Mode Colors
- Replace pure dark with warm earth tones
- Light: warm grays (#F7F6F3 sidebar)
- Dark: warm browns (#1F1E1B bg, #E6E1D8 text)
- Files: Modify `apps/x/apps/renderer/src/index.css`

### 9. Consistent Focus Ring System
- Apply `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` everywhere
- Files: Modify UI components

### 10. Button Variant Expansion
- Add xs, icon-sm, icon-lg sizes
- Add secondary variant
- Files: Modify `apps/x/apps/renderer/src/components/ui/button.tsx`
