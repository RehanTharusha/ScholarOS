---
name: revision-guide
description: Generate a comprehensive, beautifully styled HTML revision guide for any college module or subject. Reads all lecture pages, exam analysis, and concept pages to produce a self-contained HTML page with exam weight badges, comparison tables, memory hooks, SVG diagrams, step-by-step methods, interactive nav, and a quick-fire checklist. Uses the kami design language (warm parchment, ink-blue accent, serif-led hierarchy). Also generates a markdown companion. Triggers on "revision guide", "study guide", "exam prep", "revision page", "make me a revision", "create a study guide for [module]".
---

# Revision Guide Skill

Trigger: User asks for a revision guide, study guide, exam prep page, or "make me a revision HTML" for any module or subject.

## Workflow

### Step 1: Identify the module

1. Ask the user which module/subject the revision guide is for (if not already stated)
2. Confirm the module path exists under `college/{Module Name}/`
3. Read the module `overview.md` to understand scope, assessment, and linked pages
4. Read `pastpapers/exam-analysis.md` if it exists — this is critical for exam weight annotations

### Step 2: Read all source content

Read all of these in parallel:

- All lecture pages from `lectures/` (each has exam focus annotations, key concepts, tables, memory hooks)
- All concept pages from `concepts/` for deeper definitions
- The exam analysis page from `pastpapers/exam-analysis.md` for topic frequency map

### Step 3: Synthesize and structure

Organize the content into a coherent revision guide structured by week/topic. For each topic, extract:

- **Exam weight** — from the exam analysis frequency map (Always / Very High / Regular / Occasional)
- **Key concepts** — distilled from lectures, with comparison tables where applicable
- **Memory hooks** — extract or create memorable hooks (💡 blocks from lectures)
- **Exam-critical warnings** — common examiner traps, high-value topics
- **Quick-fire checklist** — questions the student should be able to answer

### Step 3.5: Map diagrams to topics (if applicable)

For modules with visual/spatial concepts (economics, networks, databases, maths, etc.), map each topic to the relevant SVG diagram. Read `references/diagrams.md` for the full template library.

**Economics diagram mapping (microeconomics):**

| Week | Topic | Diagrams from Reference |
|------|-------|------------------------|
| 1 | Scarcity, choice, opportunity cost | PPF (production possibility frontier) |
| 2 | Demand & Supply basics | Demand & Supply Equilibrium, Demand Shift |
| 3 | Market equilibrium | Supply Shift |
| 4 | Elasticities | PED: Elastic vs Inelastic (side-by-side) |
| 5 | Taxes & Subsidies | Tax Incidence, Subsidy |
| — | Price controls | Price Ceiling, Price Floor |
| 6 | Cost of Production | Cost Curves (MC, ATC, AVC, AFC) |
| 7 | Market Failure / Externalities | Negative Externality, Positive Externality |

**Non-economics diagrams:** For other modules, create simple inline SVG diagrams where they improve understanding:
- **Networks**: Star/bus/ring/mesh topology diagrams (boxes connected by lines)
- **ER Diagrams**: Entity rectangles with relationship diamonds (already covered in lecture content)
- **Business Mathematics**: Coordinate axes with curves for graphing topics
- **Organisational structures**: Hierarchy charts (boxes in tree layout)

**Rules for diagrams:**
- One diagram = one concept. Never crowd multiple concepts into one SVG.
- Every diagram must have a `<figcaption>` explaining what it shows.
- Place diagrams right after the paragraph that introduces the concept.
- Color consistently: Demand = blue, Supply = red, Government = amber, Subsidy/Social optimum = green.
- Always label axes, curves, equilibrium points, and shift arrows.

### Step 4: Generate the markdown reading page

Create `college/{Module Name}/readings/comprehensive-revision-guide.md` with:

```yaml
---
title: {Module Name} Comprehensive Revision Guide
type: reading
module: {Module Name}
section: college
date: YYYY-MM-DD
tags: [{module-code}, revision, exam, overview]
---
```

Structure:
- **Exam Quick Reference** — duration, marks, questions, pass mark, topic frequency map table
- **Week/Topic sections** — one per lecture, each with:
  - Exam weight badge
  - Comparison tables (where applicable)
  - Key concepts distilled
  - Memory hooks
  - Step-by-step methods (ER diagrams, strategic alignment, etc.)
  - Exam-critical callouts
- **Quick-Fire Revision Checklist** — comprehensive tick-list of everything the student should know
- **Related pages** — links back to lectures, concepts, exam analysis

### Step 5: Generate the HTML revision page

Create `artifacts/{Module Name} Revision Guide.html` — a fully self-contained, beautifully styled HTML file using the **kami** design language (warm parchment canvas, ink-blue accent, serif-led hierarchy), while keeping the dynamic, interactive revision guide experience with sticky nav, scroll tracking, hover effects, and card grids.

#### Required HTML design spec (kami design language):

**Color scheme** (warm parchment / ink-blue palette):
- Background: `#f5f0e8` (warm parchment)
- Surfaces: `#ffffff` / `#ede8de` (warm off-white)
- Borders: `#d9d0c0` (warm tan)
- Text: `#1a1a1a` (deep charcoal) / `#6b6258` (warm gray)
- Accent: `#1e3a5f` (ink blue) — single solid color, no gradient
- Accent light: `#e8edf4` (ink-blue tint for backgrounds)
- Tag colors: sage `#7a9e7e`, brick `#b85450`, slate `#6b7b9e`, plum `#8b6f9e`, ochre `#c4913a`, teal `#4f8a8a`

**Typography** (serif-led):
- Font stack: Charter, Georgia, Palatino, "Times New Roman", serif — same stack for both headings and body
- No separate sans-serif fallback; one typeface family per page
- Heading sizes: 2.4rem (h1), 1.6rem (h2), 1.3rem (h3), 1.1rem (h4)
- Body: 0.95rem, 1.55 line-height
- Tight tracking for headings: letter-spacing -0.01em

**Header**: Warm parchment background, bottom border with ink-blue double line, module title in serif with ink-blue color, subtitle and metadata in muted warm gray, badge pills with ink-blue border

**Sticky nav**: Horizontal scrollable links to each week/topic section, with scroll-position highlight via JS — nav has ink-blue bottom bar, active link colored ink-blue with a small triangular indicator

**Content cards and tables**:
- `.exam-critical` ink-blue bordered box with `#e8edf4` tinted background for high-stakes warnings
- `.memory-hook` plum-bordered box with 💡 icon and warm `#f0ece4` background for memory aids
- `.highlight` blocks for general callouts (ink-blue `#e8edf4` bg), important (ochre `#f5ede0` bg), tips (sage `#eaf0ea` bg), exam (brick `#f4e8e8` bg)
- `.card-grid` for showing sets of items with subtle ink-blue border on hover and warm surface shift
- Tables with `#ede8de` thead background, ink-blue header text, hover highlight on rows
- `.two-col` grid layout for side-by-side content (e.g. Zara vs Tesla cases)
- `.steps` ordered list with ink-blue numbered badges for sequential methods

**Topic frequency in nav bar**: each nav item shows the exam weight via a small colored dot — brick for Always, ochre for Very High, slate for Regular, teal for Occasional

**Diagrams**: For topics that have SVG diagrams mapped in Step 3.5, embed them as:
```html
<figure class="econ-diagram-figure">
  <svg class="econ-diagram" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
    <!-- SVG content from references/diagrams.md templates -->
  </svg>
  <figcaption>Description of what the diagram shows</figcaption>
</figure>
```
- Add CSS classes `.econ-diagram` and `.econ-diagram-figure` to the `<style>` block
- Use `<figure>` wrapping for semantic HTML and centered layout
- Figure background: warm `#f5f0e8` surface, ink-blue thin border
- Adjust axis labels and curve labels to match the specific topic being discussed
- Keep all SVG inline — no external image files

**Checklist section**: Two-column grid of `.checklist` lists with `□` prefix bullets for all revision items, checked items in ink-blue

**Footer**: Thin ink-blue top border, module name in small serif, centered, attribution in warm gray

**JavaScript**: Sticky nav scroll-highlight that tracks which section is in view; smooth scroll on nav link click; optional back-to-top button per section

### Step 6: Update indexes and log

1. Add the new reading page link to `college/{Module Name}/overview.md` under Readings
2. Add to `college/index.md` under the module's Readings subsection
3. Append to `log.md`

## Design rules

- All CSS must be inline in a single `<style>` block in the HTML `<head>` — no external dependencies
- No JavaScript frameworks — vanilla JS only for the scroll-highlight nav and interactive behaviors
- Responsive: tables should scroll horizontally on narrow screens if needed
- The `.two-col` grid should collapse to single column at 640px
- Use CSS `:root` variables for the full color palette (warm parchment / ink-blue)
- Every exam weight badge should be color-coded: brick for "Always", ochre for "Very High", slate for "Regular", teal for "Occasional"
- Tables must use consistent styling: `var(--surface2)` for `thead`, `var(--border)` for borders, hover highlight on rows
- Cards in `.card-grid` should have subtle hover effects (translateY(-1px), ink-blue border color change, background shift to warm surface)
- All interactive elements must work without a network connection (inline SVG, inline CSS, vanilla JS)

## Diagram rules

- All SVG must be inline — no external files or `<img>` tags referencing files
- Use viewBox `0 0 400 300` as the standard canvas size (except PED comparison which uses wider layout)
- Add `.econ-diagram-figure` styling for centered layout with italic captions, warm `#f5f0e8` background, ink-blue thin border
- Add `.econ-diagram` styling with `max-width: 480px; margin: 16px auto; display: block;`
- Color convention: Demand curves = `#3b82f6` (blue), Supply curves = `#ef4444` (red), Government/Tax = `#f59e0b` (amber), Subsidy/Social optimum = `#34d399` (green), Social cost/benefit = `#8b5cf6` (purple)
- Label every axis, curve, equilibrium point, and shaded area
- Use stroke-dasharray for shifted curves (original = dashed, new = solid)
- Shaded triangles for DWL, welfare gain, surplus, shortage must use semi-transparent fills (e.g. `rgba(248,113,113,0.2)`)
- Always include `<figcaption>` for accessibility and clarity
- For non-economics modules, create simple diagrams using the same SVG conventions: rectangles for entities, lines for connections, etc.

## When NOT to use this skill

- User only wants a quick summary, not a full revision page
- Module has no existing lectures or content in the vault
- User wants a PDF or printed document (use the Presentations skill instead for that)
