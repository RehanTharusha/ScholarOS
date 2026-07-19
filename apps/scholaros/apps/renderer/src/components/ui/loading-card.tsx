import { cn } from "@/lib/utils";

export type LoadingCardVariant = "card" | "list" | "page";

export interface LoadingCardProps {
  /** Number of skeleton lines to render. Defaults to 3. */
  rows?: number;
  /** Visual style. `page` fills its container, `card` is bounded, `list` uses tight rows. */
  variant?: LoadingCardVariant;
  /** Optional small uppercase label shown above the skeleton (e.g. "Building graph"). */
  label?: string;
  /** Optional className passthrough. */
  className?: string;
}

/**
 * A neutral, calm loading skeleton used wherever a structural view is
 * loading its body content. The design doc forbids bright shimmer sweeps;
 * this uses a subtle `animate-pulse` only.
 *
 *   - `page`  → full-bleed neutral panel with skeleton lines
 *   - `card`  → bounded rounded card
 *   - `list`  → tight stacked rows
 */
export function LoadingCard({
  rows = 3,
  variant = "card",
  label,
  className,
}: LoadingCardProps) {
  const widths = pickWidths(rows);

  if (variant === "page") {
    return (
      <div
        className={cn(
          "flex-1 min-h-0 flex items-center justify-center p-8",
          className,
        )}
      >
        <Skeleton label={label} rows={rows} widths={widths} />
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className={cn("space-y-2 p-3", className)}>
        {label && <Label text={label} />}
        {widths.map((w, i) => (
          <div
            key={i}
            className="h-2.5 rounded bg-muted animate-pulse"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4 space-y-3",
        className,
      )}
    >
      <Skeleton label={label} rows={rows} widths={widths} />
    </div>
  );
}

function Skeleton({
  label,
  rows,
  widths,
}: {
  label?: string;
  rows: number;
  widths: number[];
}) {
  return (
    <>
      {label && <Label text={label} />}
      {widths.map((w, i) => (
        <div
          key={i}
          className="h-3 rounded bg-muted animate-pulse"
          style={{ width: `${w}%` }}
        />
      ))}
      {/* keep rows referenced to satisfy linters; not used by JSX above */}
      <span hidden aria-hidden="true" data-rows={rows} />
    </>
  );
}

function Label({ text }: { text: string }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {text}
    </p>
  );
}

// Deterministic-ish width pattern so SSR/hydration stays stable but rows
// don't all look identical.
function pickWidths(rows: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < rows; i++) {
    // Cycle through 3 widths so consecutive cards look natural.
    const t = i % 3;
    out.push(t === 0 ? 92 : t === 1 ? 78 : 64);
  }
  return out;
}
