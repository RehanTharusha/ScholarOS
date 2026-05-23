# HumanizerPro · Web Design Skill

**Kami philosophy, adapted for the browser.** Warm parchment canvas, ink-blue accent, serif-led hierarchy, tight editorial rhythm — translated from print to Next.js + Tailwind CSS v4.

This skill governs all visual design decisions for this project. When building pages, components, or styling anything, follow these rules.

---

## Core Principles (The Ten Invariants, Web-Adapted)

1. **Page background `#f5f4ed` (parchment)**, never pure white `#ffffff`
2. **Single accent: ink-blue `#1B365D`** — the only chromatic color. CTAs, links, accents, focus rings
3. **All grays warm-toned** (yellow-brown undertone), no cool blue-grays. `rgb()` where R ≈ G > B
4. **Serif for headlines, sans for body.** `--sans` mirrors `--serif` as alias; introduce a real sans only for genuine UI chrome (labels, nav, buttons, tags)
5. **Serif weight locked at 500**, no `font-bold` (700) on serif text
6. **Line-heights**: tight headlines 1.1–1.3, body 1.5–1.65, dense UI 1.4–1.45
7. **Letter-spacing**: English body 0, labels/tags +0.5–1px, all-caps +1px
8. **Tag backgrounds solid hex**, never `rgba()` (avoids compositing artifacts)
9. **Depth via whisper shadow** (`0 4px 24px rgba(0,0,0,0.05)`) or ring shadow, never hard drop shadows
10. **Italic allowed on screen** — for poetic lines, captions, footer ethos. `font-style: normal` on brand emphasis (`<em>` with brand color)

---

## Design Tokens → Tailwind v4

Map these to `@theme` in `globals.css`. All values are the source of truth.

### Color

```css
@theme inline {
  /* Surface */
  --color-parchment: #f5f4ed;
  --color-ivory: #faf9f5;
  --color-warm-sand: #e8e6dc;
  --color-dark-surface: #30302e;
  --color-deep-dark: #141413;

  /* Brand */
  --color-brand: #1B365D;
  --color-brand-light: #2D5A8A;
  --color-brand-tint: #EEF2F7;

  /* Text */
  --color-near-black: #141413;
  --color-dark-warm: #3d3d3a;
  --color-olive: #504e49;
  --color-stone: #6b6a64;

  /* Border */
  --color-border: #e8e6dc;
  --color-border-soft: #e5e3d8;

  /* Shadow rings */
  --color-ring-warm: #d4d3cd;
  --color-ring-deep: #b8b7b0;

  /* Dark surface text */
  --color-warm-silver: #b0aea5;
}
```

**Usage in components**: `bg-parchment`, `text-brand`, `border-border-soft`, `bg-brand-tint`, etc.

**Brand area rule**: ink-blue covers ≤ 5% of viewport surface area. More than that is ornament, not restraint.

**Never use**: `bg-white` as page background, `bg-zinc-50` / `bg-gray-100` (cool tones), `shadow-lg` / `shadow-xl` (hard shadows).

### Typography

```css
@theme inline {
  /* Font families */
  --font-serif: "Charter", "Georgia", "Palatino", "Times New Roman", serif;
  --font-sans: var(--font-serif);
  --font-latin-ui: "Inter", "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", "Fira Code", Consolas, monospace;
}
```

**Font loading**: Use `next/font/google` for Charter (or Georgia as system fallback). Latin UI font for labels, nav, tags, buttons.

```tsx
import { Charter, Inter } from "next/font/google";

const charter = Charter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-serif",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-latin-ui",
});
```

**Type scale** (web px, mapped from print pt):

| Role | Size | Weight | Line-height | Tailwind class |
|---|---|---|---|---|
| Display (hero) | 64–96px | 500 | 1.10 | `text-6xl`–`text-8xl` + custom |
| H1 Section | 32–40px | 500 | 1.20 | `text-3xl`–`text-4xl` |
| H2 | 24–28px | 500 | 1.25 | `text-2xl`–`text-3xl` |
| H3 | 18–20px | 500 | 1.30 | `text-lg`–`text-xl` |
| Body Lead | 18–20px | 400 | 1.55 | `text-lg`–`text-xl` |
| Body | 16px | 400 | 1.60 | `text-base` |
| Body Dense | 14px | 400 | 1.45 | `text-sm` |
| Caption | 13px | 400 | 1.45 | `text-xs`–`text-sm` |
| Label / Tag | 12px | 600 | 1.35 | `text-xs` |
| Tiny / Meta | 12px | 400 | 1.40 | `text-xs` |

**Minimum floor**: 12px for any readable text.

**Font family rules**:
- Headlines: `font-serif` (Charter)
- Body: `font-serif` (Charter) — serif carries authority
- UI chrome (nav, tags, buttons, labels): `font-latin-ui` (Inter)
- Code: `font-mono`

**Weight rules**:
- Serif: only 400 and 500. Never `font-bold` (700) on serif text
- Use `font-medium` (500) for serif emphasis
- Sans UI: 400, 500, 600 allowed

### Spacing

Base unit: 4px. All spacing snaps to this grid.

| Tier | Value | Use |
|---|---|---|
| xs | 2–4px | Inline adjacent elements |
| sm | 4–8px | Tag padding, dense layout |
| md | 8–12px | Component interior |
| lg | 16–24px | Between components / card padding |
| xl | 24–40px | Section margins |
| 2xl | 40–80px | Between major sections |
| 3xl | 80–120px | Between chapters / page sections |

**Container**: `max-w-[1120px]` centered. Section padding: `py-20 px-8` (80px vertical, 32px horizontal).

**Responsive breakpoints**: `880px` (tablet), `480px` (phone).

### Border Radius

Scale: `2px → 4px → 6px → 8px (default) → 12px → 16px → 24px → 999px (pill)`.

- Cards: `rounded-lg` (8px)
- Featured cards: `rounded-2xl` (16px)
- Buttons: `rounded-full` (pill)
- Tags: `rounded-sm` (2px)
- Hero containers: `rounded-3xl` (24px)

---

## Component Patterns

### Card

```tsx
<div className="bg-ivory border border-border rounded-lg p-6 transition-shadow hover:shadow-[0_4px_24px_rgba(0,0,0,0.05)]">
  {children}
</div>
```

### Button

**Primary**:
```tsx
<button className="bg-brand text-ivory font-latin-ui text-sm font-medium px-6 py-3 rounded-full border border-brand min-w-[158px] transition-all hover:bg-brand-light hover:-translate-y-0.5">
  {children}
</button>
```

**Ghost**:
```tsx
<button className="bg-transparent text-brand font-latin-ui text-sm font-medium px-6 py-3 rounded-full border border-brand min-w-[158px] transition-all hover:bg-brand-tint hover:-translate-y-0.5">
  {children}
</button>
```

### Tag

```tsx
<span className="bg-brand-tint text-brand text-xs font-latin-ui font-semibold px-2 py-0.5 rounded-sm tracking-wide uppercase">
  {children}
</span>
```

### Section Title (brand left bar)

```tsx
<h2 className="font-serif text-2xl font-medium text-near-black mt-8 mb-4 border-l-[2.5px] border-brand rounded-sm pl-3">
  {title}
</h2>
```

### Metric / Data Card

```tsx
<div className="flex flex-col gap-1">
  <span className="font-serif text-4xl font-medium text-brand tabular-nums">
    {value}
  </span>
  <span className="font-latin-ui text-xs text-stone">{label}</span>
</div>
```

### Quote

```tsx
<blockquote className="border-l-2 border-brand pl-4 text-olive leading-relaxed">
  {children}
</blockquote>
```

### Code Block

```tsx
<pre className="bg-ivory border border-border rounded-md p-4 font-mono text-sm leading-relaxed overflow-x-auto">
  <code>{children}</code>
</pre>
```

### Eyebrow (section opener)

```tsx
<div className="flex items-center gap-2 mb-4">
  <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
  <span className="font-latin-ui text-xs font-medium tracking-widest uppercase text-stone">
    {label}
  </span>
</div>
```

### Feature Row (two-column)

```tsx
<div className="grid grid-cols-[200px_1fr] gap-9 py-6 border-b border-border-soft">
  <h3 className="font-serif text-xl font-medium text-brand">{name}</h3>
  <p className="text-dark-warm leading-relaxed">{description}</p>
</div>
```

### FAQ Pair

```tsx
<div className="mb-6">
  <dt className="font-serif text-base font-medium text-near-black mt-0">
    {question}
  </dt>
  <dd className="text-sm text-olive mt-1">{answer}</dd>
</div>
```

### Footer Colophon

```tsx
<footer className="flex flex-col md:flex-row justify-between gap-8 pt-12 border-t border-border">
  <div className="flex items-start gap-4">
    <div className="w-14 h-14 rounded-lg bg-brand flex items-center justify-center">
      {/* icon */}
    </div>
    <div>
      <h4 className="font-serif text-lg font-medium text-near-black">{brand}</h4>
      <p className="text-sm text-olive">{tagline}</p>
    </div>
  </div>
  <div className="text-sm text-dark-warm">
    <a href="/docs">Docs</a> &middot; <a href="/pricing">Pricing</a> &middot; <a href="/blog">Blog</a>
    <p className="mt-2 font-serif text-sm text-olive italic max-w-sm">{ethos}</p>
  </div>
</footer>
```

---

## Layout Architecture

### Page Structure

```
<header>  — eyebrow nav, sticky or static
<section> — hero: display title + tagline + CTA
<section> — features / value props
<section> — metrics / social proof
<section> — pricing (if applicable)
<section> — FAQ
<section> — manifesto / ethos
<footer>  — brand mark + colophon
```

### Section Pattern

Every section follows this rhythm:

```tsx
<section className="py-20 px-8">
  <div className="max-w-[1120px] mx-auto">
    <div className="eyebrow">...</div>
    <h2 className="section-title">...</h2>
    <p className="section-lede">...</p>
    {/* section content */}
  </div>
</section>
```

### Dark Section Alternation

For visual rhythm, alternate light/dark sections:

```tsx
<section className="py-20 px-8 bg-deep-dark">
  <div className="max-w-[1120px] mx-auto">
    {/* text switches to warm-silver / ivory */}
  </div>
</section>
```

Dark section text:
- Headings: `text-ivory`
- Body: `text-warm-silver`
- Accent: `text-brand-light`

---

## Anti-Patterns (What Not To Do)

| Pattern | Why | Fix |
|---|---|---|
| `bg-white` as page background | Breaks parchment warmth | Use `bg-parchment` |
| `shadow-lg`, `shadow-xl` | Hard shadows feel digital, not paper | Use `shadow-[0_4px_24px_rgba(0,0,0,0.05)]` |
| `font-bold` on serif text | Synthetic bold on Charter looks heavy | Use `font-medium` (500) |
| Cool grays (`zinc`, `gray`, `slate`) | Wrong undertone, feels sterile | Use warm tokens (`stone`, `olive`, custom) |
| Multiple chromatic colors | Breaks single-accent discipline | Ink-blue only, vary opacity not hue |
| `bg-zinc-50` / `bg-gray-100` | Cool-tone surfaces | Use `bg-ivory` or `bg-warm-sand` |
| `rounded-3xl` on small elements | Over-rounded, feels playful not editorial | Match radius to element scale |
| `tracking-tight` on body text | Reduces readability | Only on large display headings |
| `leading-loose` on body | Web rhythm, not editorial | Use `leading-relaxed` (1.625) or custom 1.55 |
| Inventing metrics or fake data | Breaks trust | Use real numbers or omit |

---

## Animation Guidelines

**Philosophy**: subtle, purposeful, respects `prefers-reduced-motion`.

### Hero Entrance

```css
@keyframes hero-in {
  from {
    opacity: 0;
    transform: translateY(10px);
    filter: blur(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}

.hero-title {
  animation: hero-in 900ms 120ms both;
}
```

### Hover Transitions

- Buttons: `transition-all duration-200 hover:-translate-y-0.5`
- Cards: `transition-shadow duration-200` with whisper shadow on hover
- Links: `transition-colors duration-150`

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Responsive Strategy

| Breakpoint | Width | Behavior |
|---|---|---|
| Default | > 880px | Full layout, two-column grids |
| Tablet | ≤ 880px | Single column, reduced padding (`py-16 px-6`) |
| Phone | ≤ 480px | Compact padding (`py-12 px-4`), hero title scales down |

**Hero title scaling**:
- Desktop: `text-7xl` (72px)
- Tablet: `text-5xl` (48px)
- Phone: `text-4xl` (36px)

---

## Content Principles

1. **Data over adjectives** — "8 years" beats "extensive experience"
2. **Distinctive phrasing** — avoid AI clichés ("leverage", "cutting-edge", "revolutionary")
3. **One assertion per heading** — headings state conclusions, not topics
4. **Numbers earn their place** — every metric should answer "so what?"
5. **Whitespace is content** — editorial rhythm comes from breathing room, not decoration

---

## Quick Decisions

| Need | Use |
|---|---|
| Big headline | `font-serif font-medium text-4xl+ leading-tight` |
| Reading body | `font-serif text-base leading-relaxed text-dark-warm` |
| UI label / tag | `font-latin-ui text-xs font-semibold uppercase tracking-wide` |
| Emphasize a number | `text-brand font-serif font-medium tabular-nums` |
| Divide sections | `border-l-2 border-brand` or `border-b border-border-soft` |
| Quote | `border-l-2 border-brand pl-4 text-olive` |
| Code | `font-mono text-sm bg-ivory border border-border rounded-md p-4` |
| Primary CTA | `bg-brand text-ivory rounded-full` (pill) |
| Secondary CTA | `border border-brand text-brand rounded-full` (ghost) |
| Card hover | whisper shadow only, no ring overlay |
| Section opener | eyebrow dot + uppercase label + serif heading |
| Dark section | `bg-deep-dark` + `text-warm-silver` body + `text-ivory` headings |

Not on this table → return to first principles: **serif carries authority, sans carries utility, warm gray carries rhythm, ink-blue carries focus**.

---

## When Building

1. **Start with tokens** — add colors, fonts, spacing to `@theme` in `globals.css` before writing components
2. **Compose from patterns** — use the component patterns above, don't invent new ones
3. **Check anti-patterns** — scan for cool grays, hard shadows, bold serif, white backgrounds
4. **Verify responsive** — test at 880px and 480px breakpoints
5. **Respect reduced motion** — all animations must degrade gracefully

---

*This skill adapts the Kami print design system (warm parchment, ink-blue, serif-led, editorial rhythm) for web delivery via Next.js + Tailwind CSS v4. The philosophy is identical; the medium changes from A4 to viewport.*
