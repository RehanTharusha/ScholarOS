import { cn } from "@/lib/utils";

const STEPS = [
  { key: "staged", label: "Staged" },
  { key: "ingesting", label: "Ingesting" },
  { key: "paused", label: "Review" },
  { key: "done", label: "Ready" },
] as const;

type Phase = "idle" | "ingesting" | "paused" | "done";

export function IngestStepper({ phase }: { phase: Phase }) {
  const currentIndex = phase === "idle" ? 0 : STEPS.findIndex((s) => s.key === phase);
  const activeIndex = currentIndex < 0 ? 0 : currentIndex;

  return (
    <div className="flex items-center gap-1 text-xs">
      {STEPS.map((step, i) => {
        const isActive = i === activeIndex;
        const isDone = i < activeIndex;
        return (
          <div key={step.key} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : isDone
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="text-muted-foreground/40">·</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
