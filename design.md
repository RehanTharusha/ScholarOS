# ScholarOS / Rowboat Design System

This document is the visual and interaction contract for the ScholarOS Electron app and the Rowboat surfaces it reuses. If a new feature screen, modal, sidebar, panel, or dashboard is being added, this file is the first design reference.

The goal is not to make every screen identical. The goal is to keep every screen recognizably part of the same product: the same spacing rhythm, the same panel language, the same typography hierarchy, the same control density, and the same visual restraint.

If a feature cannot be designed using the rules below, the default response is to reuse an existing Rowboat pattern, not invent a new one.

## Design Principles

1. Use the product shell first.
   - Start from the existing app layout, sidebar, tab bar, page header, and card primitives.
   - New screens should feel like they belong inside the app, not like a separate landing page.

2. Prefer neutral surfaces over decorative treatment.
   - Use `bg-background`, `bg-card`, `bg-muted`, `border-border`, and `text-foreground` as the default palette.
   - Reserve strong color for state, emphasis, or a small accent element, not full-screen backgrounds.

3. Keep borders, spacing, and radius consistent.
   - Most panels should be rounded `2xl`.
   - Most spacing should follow 4, 8, 12, 16, 20, 24, 32 pixel increments.
   - Do not mix many different corner radii on the same screen unless the hierarchy explicitly needs it.

4. Avoid visual novelty that does not improve comprehension.
   - No custom gradients unless they are solving a specific readability or hierarchy problem.
   - No decorative glow, glassmorphism, or neon treatment unless the existing app already uses it for that exact kind of surface.

5. Make state visible.
   - Empty, loading, error, disabled, and selected states must be explicit.
   - Do not rely on color alone to communicate state.

6. Prefer shared primitives over bespoke JSX.
   - Reuse `Button`, `Badge`, `Input`, `Textarea`, `Select`, `Switch`, `Dialog`, `Sidebar`, `Tabs`, and the academic shell components.
   - If a repeated layout pattern appears twice, extract it into a reusable component.

## Source of Truth

The following files define the current implementation-level design language:

- [apps/x/apps/renderer/src/components/academic/academic-shell.tsx](apps/x/apps/renderer/src/components/academic/academic-shell.tsx)
- [apps/x/apps/renderer/src/components/ui/button.tsx](apps/x/apps/renderer/src/components/ui/button.tsx)
- [apps/x/apps/renderer/src/components/ui/badge.tsx](apps/x/apps/renderer/src/components/ui/badge.tsx)
- [apps/x/apps/renderer/src/components/ui/input.tsx](apps/x/apps/renderer/src/components/ui/input.tsx)
- [apps/x/apps/renderer/src/components/ui/textarea.tsx](apps/x/apps/renderer/src/components/ui/textarea.tsx)
- [apps/x/apps/renderer/src/components/ui/select.tsx](apps/x/apps/renderer/src/components/ui/select.tsx)
- [apps/x/apps/renderer/src/components/tab-bar.tsx](apps/x/apps/renderer/src/components/tab-bar.tsx)
- [apps/x/apps/renderer/src/components/sidebar-content.tsx](apps/x/apps/renderer/src/components/sidebar-content.tsx)
- [apps/x/apps/renderer/src/App.css](apps/x/apps/renderer/src/App.css)

If a choice here conflicts with another document, treat the component implementation and this file as higher priority than informal examples elsewhere.

## Canonical Visual Language

### Surfaces

Use these surface roles consistently:

- `bg-background` for the app canvas and primary page backgrounds.
- `bg-card` for contained panels, cards, list containers, and sub-sections.
- `bg-muted` for nested callouts, previews, and low-emphasis background fills.
- `bg-accent` only for hover or active affordances where the component expects it.

Avoid these defaults for new product screens:

- Large full-screen custom radial gradients.
- Dark hero backgrounds with multiple overlaid color stops.
- Semi-transparent glass panels stacked on top of decorative canvases.

### Borders

Borders are the main separator in the app. They should do most of the visual work.

- Use `border-border` for standard separation.
- Use `border-dashed border-border` for empty states or drop zones.
- Use `border-destructive/20`, `border-amber-500/20`, or `border-emerald-500/20` only for semantic states.

Avoid shadow-heavy separation. A subtle `shadow-sm` is fine on elevated cards, but shadows should not be the primary container boundary.

### Radius

Radius should be boring and consistent.

- Standard cards and panels: `rounded-2xl`.
- Smaller pills and badges: `rounded-full`.
- Form controls: the component defaults already provide the right radius.
- Large section containers should not exceed `2xl` unless they are intentionally modal-like.

### Typography

Typography hierarchy should be predictable.

- Page title: `text-2xl font-semibold tracking-tight`.
- Section title: `text-lg font-semibold`.
- Body copy: `text-sm text-muted-foreground` or `text-sm text-foreground` depending on emphasis.
- Metadata and labels: `text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground`.

Do not introduce a second headline style for the same level of hierarchy. Avoid oversized hero typography inside application views.

## Layout System

### App Shell

The page should live inside the existing Rowboat shell. New study-mode screens should follow this structure:

1. Page shell.
2. Header with eyebrow, title, description, and right-side actions.
3. Main content area with `px-6 py-5`.
4. Optional two-column layout for working surface plus supporting panel.

The current academic shell is the default implementation pattern:

- `AcademicPageShell`
- `AcademicPageHeader`
- `AcademicCard`
- `AcademicMetricCard`
- `AcademicSectionTitle`
- `AcademicEmptyState`

Use these before creating anything new.

### Spacing

Spacing should remain consistent across pages:

- Page padding: `px-6 py-5`.
- Between top header and body: `border-b` with no extra gap.
- Between major cards: `gap-5` or `gap-4`.
- Inside cards: `p-4` or `p-6` depending on density.
- Between label and control: `space-y-2`.
- Between section title and section body: `mt-3` or `mt-4`.

Do not use ad hoc padding values that create a new rhythm for one feature.

### Density

The app should feel productive, not airy.

- Favor compact but breathable layouts.
- Keep controls close to the content they act on.
- Do not vertically center entire product views unless the screen is genuinely empty or loading.

## Shared Component Rules

### Buttons

Default button behavior:

- Use `Button` from `@/components/ui/button`.
- Use `variant="outline"` for secondary actions.
- Use `variant="ghost"` for low-emphasis navigation.
- Use `variant="secondary"` for balanced emphasis.
- Use `variant="destructive"` only for destructive actions.
- Use `size="sm"` for header actions.
- Use icon buttons sparingly and only when the action is obvious.

Do not create custom clickable pill buttons with bespoke colors unless they map to a true semantic state.

### Badges

Badges are for metadata and state labels, not for decoration.

- Use `Badge variant="outline"` for tags, priorities, concept labels, and review metadata.
- Use `Badge variant="secondary"` for contextual labels in headers.
- Keep badge text short.
- Do not overload a screen with many competing badge colors.

### Inputs

Use the standard form primitives.

- `Input` for single-line text.
- `Textarea` for larger editable blocks.
- `Select` for discrete choices.
- `Switch` for binary toggles.

Do not restyle inputs per screen. If a form needs a different look, the change belongs in the shared primitive, not in each feature screen.

### Cards and Panels

The panel hierarchy should be explicit:

- `AcademicMetricCard` for summary stats.
- `AcademicCard` for a working surface or primary panel.
- `AcademicSectionTitle` for subsection headers inside a card.
- `AcademicEmptyState` for absence, loading, or no-data situations.

Avoid custom card variants that duplicate the same border, background, and padding decisions.

## Semantic Color Usage

Color should be reserved for meaning.

### Allowed Uses

- Destructive red for errors and destructive actions.
- Amber for caution or unsupported claims.
- Emerald for success, completion, or clean validation.
- Blue or cyan only when the feature specifically needs a study/knowledge emphasis and the saturation is restrained.

### Disallowed Uses

- Full-screen purple, cyan, teal, or green gradients just because the feature is new.
- Multiple brightly colored accent cards on the same screen with no semantic distinction.
- Neon button fills that dominate the rest of the interface.

### Rule of Thumb

If removing the accent color makes the screen clearer, the color was unnecessary.

## State Design

### Loading

Loading states should be calm and structural.

- Use a neutral loading card or empty-state container.
- If the screen has a stable shell, show it and replace only the body content.
- Avoid animated gradients or flashy skeletons unless the rest of the app already uses them.

### Empty

Empty states should explain what the user should do next.

- Title: concise and direct.
- Description: one sentence describing why the state exists.
- Action: a single primary next step if applicable.

### Error

Errors should be styled as clear semantic callouts.

- Use `border-destructive/20 bg-destructive/10 text-destructive` as the default error pattern.
- Keep the message close to the failing control or section.
- Avoid page-wide error banners unless the entire view failed.

### Disabled

Disabled controls must look disabled and remain visually consistent with the base component.

- Do not fake disabled states with lower-contrast text only.
- Use the component-level disabled handling.

### Selected / Active

Selection should be visible but not loud.

- Use borders, muted fills, or subtle background shifts.
- Avoid large scale jumps or glowing outlines.

## Feature-Specific Patterns

### Flashcards

Flashcards should feel like a focused review workspace.

- One main review card.
- One supporting note panel.
- Summary stats above the fold.
- Buttons should use standard variants only.
- The answer reveal should be a content toggle, not a dramatic animation.

Do:

- Keep the prompt and answer inside the same structural card.
- Use metadata chips for difficulty, concept, and due date.

Do not:

- Turn flashcards into a game UI.
- Use saturated green/cyan/blue call-to-action bars as the primary visual device.
- Introduce 3D flip animations unless they improve comprehension.

### Essay Feedback

Essay review should read as a document workspace with a feedback sidebar.

- Left side: draft, rubric, and controls.
- Right side: score summary, criterion breakdown, citation checks.
- Keep the draft area dominant.
- Use standard form controls, not custom editor chrome.

Do:

- Keep rubric and draft editing grounded in plain form components.
- Use score badges or compact chips for rubric criteria.

Do not:

- Build a separate design system just for writing feedback.
- Use dark emerald hero panels or glowing feedback boxes.

### Dashboard

Dashboards should be informational, not promotional.

- Summary metrics should be compact cards.
- Secondary content should be in a bordered section card.
- Use list items or small cards for upcoming deadlines.
- Prefer neutral hierarchy and let the data be the visual focus.

Do:

- Keep the number of widgets small and readable.
- Use consistent metric cards for the top row.

Do not:

- Mix gradient metric tiles, neon icon blocks, and dark panels in the same layout.

### Assignment Board / Kanban

The board should feel like a structured workspace.

- Each column is a card.
- Each task is a card.
- Column headers show the status and count.
- Move actions should be small and direct.

Do:

- Keep column containers aligned and consistent.
- Use the same card style as the rest of the app for tasks.
- Use the built-in select control for filters.

Do not:

- Add custom board chrome, heavy shadows, or decorative status bars.
- Over-animate drag and drop. The movement should be obvious but restrained.

## Content Rules

### Copy Tone

The product tone should be clear, direct, and practical.

- Avoid marketing language inside the app shell.
- Avoid metaphor-heavy descriptions on task surfaces.
- Use task-oriented language: review, grade, refresh, filter, due, completed.

### Labels

- Prefer short labels.
- Avoid duplicate nouns in the same panel.
- Use the same term consistently for the same concept.

### Microcopy

- Empty states should tell the user what to do next.
- Error messages should say what failed and, when possible, why.
- Helper text should be one sentence unless a section truly needs more.

## Interaction Rules

### Hover and Focus

- Hover states should be subtle and predictable.
- Focus states must be visible and accessible.
- Keep interactive affordances aligned with the rest of the product primitives.

### Motion

Motion should be functional, not ornamental.

- Use motion to confirm a state change or guide attention.
- Do not introduce large entrance animations for ordinary data panels.
- Respect reduced motion settings.

### Keyboard and Accessibility

- Every interactive control must be keyboard accessible.
- Form controls should have labels or clear accessible text.
- Color alone cannot carry meaning.
- Contrast must remain readable in both light and dark themes.

## Dark Mode and Light Mode

The app must look intentionally designed in both themes.

- Use token-based colors instead of hard-coded hex values.
- Test surfaces in light and dark modes.
- Avoid styles that only work against a dark canvas.

The design should not depend on a dramatic dark theme to look acceptable.

## Implementation Rules for New Features

Before building a new screen, answer these questions:

1. Which existing page pattern is this closest to?
2. Can this be expressed with `AcademicPageShell`, `AcademicPageHeader`, and `AcademicCard`?
3. What is the primary user action on this screen?
4. What is the one dominant piece of information?
5. What state must be obvious immediately: loading, empty, error, or active?

If the answer to any of those questions is unclear, do not design a custom one-off layout yet.

### Preferred Build Order

1. Start with the page shell.
2. Add the header.
3. Add the primary card.
4. Add summary cards if needed.
5. Add sidebar or secondary panel.
6. Add empty, error, and loading states.
7. Add only the minimum accent color necessary.

### Refactor Rule

If a screen contains more than one occurrence of the same border/background/padding combination, consider extracting a shared component.

## Anti-Patterns

Do not do these:

- Build new views with custom radial backgrounds and layered gradients.
- Use unrelated accent colors across a single feature screen.
- Mix card languages within the same feature.
- Use text that fights the theme colors instead of leveraging the app tokens.
- Create one-off rounded containers that do not match the existing radius scale.
- Ship screens without empty or error states.
- Override the shared button/input/select styling per feature.
- Make the page feel like a different app because it is a new feature.

## Practical Review Checklist

Before merging any new UI feature, verify:

- The screen uses the app's shared shell, not a standalone art direction.
- The page title, description, and actions are in a consistent header.
- Cards and panels use the standard border/background/radius language.
- Buttons and badges come from shared primitives.
- The screen has loading, empty, and error states.
- The layout works in both narrow and wide windows.
- The screen is still legible if all decorative color is removed.
- The feature looks like it belongs next to the existing chat, sidebar, and tab-bar UI.

## Recommended Component Inventory

Prefer to reuse or extend these before inventing a new structure:

- `AcademicPageShell`
- `AcademicPageHeader`
- `AcademicMetricCard`
- `AcademicCard`
- `AcademicSectionTitle`
- `AcademicEmptyState`
- `Button`
- `Badge`
- `Input`
- `Textarea`
- `Select`
- `Switch`
- `Dialog`
- `Tabs`
- `Sidebar`

If a new component is created, it should clearly solve a repeated problem and should match the language of the existing primitives.

## Notes on Existing Academic Screens

The current study-mode screens are intended to be the examples for future feature design:

- Flashcards show the neutral metric cards, a centered review panel, and a support notes column.
- Essay feedback shows a working surface on the left and a summary sidebar on the right.
- The dashboard uses small metric cards and a simple upcoming-deadlines section.
- The assignment board uses standard column cards and task cards.

That is the baseline. New screens should look adjacent to those, not unlike them.

## Decision Rule

When in doubt, choose the least surprising implementation that preserves clarity.

The default answer to a new visual idea should be:

- Can the same outcome be achieved with the existing Rowboat primitives?
- If yes, use those primitives.
- If no, add the smallest reusable abstraction possible and update this document.
