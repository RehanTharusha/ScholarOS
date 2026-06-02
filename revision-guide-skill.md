---
name: revision-guide
description: Generate a comprehensive, beautifully styled HTML revision guide for any college module or subject. Reads all lecture pages, exam analysis, and concept pages to produce a self-contained HTML page with exam weight badges, comparison tables, memory hooks, SVG/Mermaid diagrams, KaTeX-rendered math, step-by-step methods, interactive nav, and a quick-fire checklist. Uses the Paper design system (clean white surface, near-black text, purple secondary accent, Roboto/Montserrat/PT Mono typography). Also generates a markdown companion. Triggers on "revision guide", "study guide", "exam prep", "revision page", "make me a revision", "create a study guide for [module]".
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

Create `artifacts/{Module Name} Revision Guide.html` — a fully self-contained, beautifully styled HTML file using the **Paper** design system (clean white surface, near-black text, purple secondary accent), while keeping the dynamic, interactive revision guide experience with sticky nav, scroll tracking, hover effects, and card grids.

#### Required HTML design spec (Paper design system):

**Color scheme** (clean / minimal palette):
- Background: `#FAFAFA` (off-white surface)
- Surfaces: `#FFFFFF` (white cards, panels)
- Borders: `#E5E7EB` (subtle gray)
- Text: `#111827` (near-black body) / `#6B7280` (muted gray)
- Primary: `#111111` (near-black)
- Secondary: `#8B5CF6` (purple accent — used sparingly for links, highlights, interactive elements)
- Success: `#16A34A` (green)
- Warning: `#D97706` (amber)
- Danger: `#DC2626` (red)
- Tag colors: sage `#7A9E7E`, brick `#B85450`, slate `#6B7B9E`, plum `#8B6F9E`, ochre `#C4913A`, teal `#4F8A8A`

**Typography** (sans-serif-led with mono for code/math):
- Body font: Roboto (sans-serif) — weights 300, 400, 500, 600, 700, font-size 16px, line-height 1.6
- Display font: Montserrat (sans-serif, weights 500-800) — for h1/h2 headings, uppercase optional on h1
- Mono font: PT Mono — for code blocks, inline code, equations, technical notation
- Scale: 0.875rem/1rem/1.125rem/1.5rem/2rem/2.5rem (14/16/18/24/32/40)
- Heading sizes: 2.5rem (h1, Montserrat 700), 1.5rem (h2, Montserrat 600), 1.125rem (h3, Roboto 600), 1rem (h4, Roboto 500)
- Body: 1rem / 1.6 line-height (Roboto 400)
- Code: 0.875rem (PT Mono)
- Import Google Fonts inside the `<style>` block (not bare in `<head>`):
  ```html
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&family=Montserrat:wght@500;600;700;800&family=PT+Mono&display=swap");
    /* all other CSS rules follow */
  </style>
  ```
  The `@import` must be the first line inside `<style>`, before any other CSS rules — this is a CSS requirement, not a suggestion.

**Header**: White background, bottom border with `#E5E7EB` thin rule, module title in Montserrat 700 with near-black color, subtitle and metadata in muted `#6B7280` Roboto, badge pills with `#8B5CF6` purple border

**Sticky nav**: Horizontal scrollable Roboto 500 links to each week/topic section, with scroll-position highlight via JS — nav has `#E5E7EB` bottom bar, active link colored `#8B5CF6` purple with a small triangular indicator

**Content cards and tables**:
- `.exam-critical` `#8B5CF6`-bordered box with `#F5F3FF` (purple tint) background for high-stakes warnings
- `.memory-hook` `#8B6F9E`-bordered box with 💡 icon and `#F9F9FB` background for memory aids
- `.highlight` blocks for callouts: purple `#F5F3FF` (info), amber `#FFFBEB` (important), green `#F0FDF4` (tips), red `#FEF2F2` (exam)
- `.card-grid` for showing sets of items with subtle purple border on hover and white surface
- Tables with `#F9FAFB` thead background, near-black header text, hover highlight on rows
- `.two-col` grid layout for side-by-side content (e.g. Zara vs Tesla cases)
- `.steps` ordered list with purple numbered badges (Roboto 600) for sequential methods

**Topic frequency in nav bar**: each nav item shows the exam weight via a small colored dot — red for Always, amber for Very High, slate for Regular, teal for Occasional

**Diagrams (SVG)**: For topics best illustrated with custom SVG, embed as inline SVG with `<figure>` wrapping, white figure background, `#E5E7EB` thin border, italic captions in Roboto

**Diagrams (Mermaid)**: For flowcharts, sequence diagrams, ER diagrams, class diagrams, or other structured diagrams, use Mermaid syntax in `<pre class="mermaid">` blocks. Include Mermaid JS in the `<head>` (see Math & Diagrams section below for CDN setup).

**KaTeX math**: All mathematical expressions should use KaTeX delimiters: `$$...$$` for display math, `$...$` for inline math. Include KaTeX CSS + JS in the `<head>` (see Math & Diagrams section below).

**Checklist section**: Two-column grid of `.checklist` lists with `□` prefix bullets for all revision items, checked items in purple `#8B5CF6`

**Footer**: Thin `#E5E7EB` top border, module name in small Roboto, centered, attribution in `#6B7280`

**JavaScript**: Sticky nav scroll-highlight that tracks which section is in view; smooth scroll on nav link click; optional back-to-top button per section

#### Math & Diagrams integration (KaTeX + Mermaid):

Include these in the HTML `<head>` to enable math typesetting and diagram generation:

**KaTeX setup** (from cdn.jsdelivr.net) — IMPORTANT: use synchronous scripts + `DOMContentLoaded`, NOT `defer` + `onload` (which has unreliable timing between script download and execution):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" crossorigin="anonymous"></script>
<script>
  document.addEventListener("DOMContentLoaded", function () {
    renderMathInElement(document.body, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false}
      ]
    });
  });
</script>
```

- Use `$...$` for inline math (e.g. `$E = mc^2$`)
- Use `$$...$$` for display math (e.g. `$$\int_{a}^{b} f(x)\,dx$$`)
- KaTeX handles LaTeX notation: fractions `\frac{}{}`, integrals, matrices, Greek letters, etc.
- For offline use, download the KaTeX dist and host alongside the HTML file, updating the href/src paths accordingly

**Mermaid setup** (from cdn.jsdelivr.net):

```html
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>mermaid.initialize({ startOnLoad: true, theme: "default", securityLevel: "loose" });</script>
```

Then use `<pre class="mermaid">` blocks for diagrams:

```html
<pre class="mermaid">
  graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Result]
    B -->|No| D[Alternative]
</pre>
```

**Supported Mermaid diagram types:**
- Flowcharts (`graph TD/LR`)
- Sequence diagrams (`sequenceDiagram`)
- Class diagrams (`classDiagram`)
- Entity Relationship diagrams (`erDiagram`)
- Gantt charts (`gantt`)
- Pie charts (`pie`)
- State diagrams (`stateDiagram-v2`)
- Git graphs (`gitGraph`)

**When to choose SVG vs Mermaid:**
- Use hand-coded inline SVG for: custom economic diagrams (supply/demand curves), precise coordinate geometry, detailed illustrations
- Use Mermaid for: flowcharts, ER diagrams, sequence diagrams, class diagrams, org charts, state machines, Git workflows
- Mermaid is preferred for structured diagrams because it's faster to write and maintains consistent styling

### Step 6: Update indexes and log

1. Add the new reading page link to `college/{Module Name}/overview.md` under Readings
2. Add to `college/index.md` under the module's Readings subsection
3. Append to `log.md`

## Design rules

- All CSS must be inline in a single `<style>` block in the HTML `<head>` — no external dependencies (except Google Fonts @import and KaTeX/Mermaid CDN scripts which are loaded from CDN)
- No JavaScript frameworks — vanilla JS only for the scroll-highlight nav and interactive behaviors
- Responsive: tables should scroll horizontally on narrow screens if needed
- The `.two-col` grid should collapse to single column at 640px
- Use CSS `:root` variables for the full color palette (Paper design system)
- Every exam weight badge should be color-coded: red for "Always", amber for "Very High", slate for "Regular", teal for "Occasional"
- Tables must use consistent styling: `var(--surface2)` for `thead`, `var(--border)` for borders, hover highlight on rows
- Cards in `.card-grid` should have subtle hover effects (translateY(-1px), purple border color change to `#8B5CF6`, white surface)
- All interactive elements must work without a network connection — CDN resources (Google Fonts, KaTeX, Mermaid) are cached on first load and should gracefully degrade if offline (KaTeX renders raw LaTeX, Mermaid shows raw code blocks)
- KaTeX and Mermaid assets may be loaded from CDN; this is acceptable for the trade-off of proper math typesetting and diagram rendering. For offline distribution, bundle the JS/CSS files alongside the HTML.

## Diagram rules

### SVG diagrams

- All SVG must be inline — no external files or `<img>` tags referencing files
- Use viewBox `0 0 400 300` as the standard canvas size (except PED comparison which uses wider layout)
- Add `.econ-diagram-figure` styling for centered layout with italic captions in Roboto, white background, `#E5E7EB` thin border
- Add `.econ-diagram` styling with `max-width: 480px; margin: 16px auto; display: block;`
- Color convention: Demand curves = `#3B82F6` (blue), Supply curves = `#EF4444` (red), Government/Tax = `#D97706` (amber), Subsidy/Social optimum = `#16A34A` (green), Social cost/benefit = `#8B5CF6` (purple)
- Label every axis, curve, equilibrium point, and shaded area
- Use stroke-dasharray for shifted curves (original = dashed, new = solid)
- Shaded triangles for DWL, welfare gain, surplus, shortage must use semi-transparent fills (e.g. `rgba(248,113,113,0.2)`)
- Always include `<figcaption>` for accessibility and clarity
- For non-economics modules, create simple diagrams using the same SVG conventions: rectangles for entities, lines for connections, etc.

### Mermaid diagrams

- Use Mermaid for structured diagrams: flowcharts, sequence diagrams, ER diagrams, class diagrams, state diagrams, Gantt charts, pie charts, Git graphs
- Wrap Mermaid syntax in `<pre class="mermaid">` blocks
- Every Mermaid block should have an accompanying `<figcaption>` or preceding paragraph explaining what the diagram shows
- Mermaid must be initialized with `securityLevel: "loose"` to allow click events and HTML labels
- If the diagram is simple (3-5 nodes), a Mermaid flowchart is preferred over hand-coded SVG for maintainability
- For complex custom diagrams with precise positioning (e.g. economic supply/demand curves, detailed cell biology), use inline SVG instead of Mermaid
- Mermaid diagrams can be styled with CSS variables; the default theme creates clean output that matches the Paper design system

## When NOT to use this skill

- User only wants a quick summary, not a full revision page
- Module has no existing lectures or content in the vault
- User wants a PDF or printed document (use the Presentations skill instead for that)
