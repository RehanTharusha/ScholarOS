import * as React from "react";
import { BrainCircuit, Clock3, Layers3, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function FlashcardStats({
  totalCount,
  dueCount,
  masteredCount,
  className,
}: {
  totalCount: number;
  dueCount: number;
  masteredCount: number;
  className?: string;
}) {
  const cards = [
    {
      label: "Total cards",
      value: totalCount,
      icon: Layers3,
      accent: "from-sky-500/20 to-cyan-500/10",
    },
    {
      label: "Due now",
      value: dueCount,
      icon: Clock3,
      accent: "from-amber-500/20 to-orange-500/10",
    },
    {
      label: "Mastered",
      value: masteredCount,
      icon: Sparkles,
      accent: "from-emerald-500/20 to-lime-500/10",
    },
    {
      label: "Review flow",
      value:
        totalCount === 0 ? 0 : Math.round((masteredCount / totalCount) * 100),
      suffix: "%",
      icon: BrainCircuit,
      accent: "from-violet-500/20 to-fuchsia-500/10",
    },
  ];

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={cn(
              "rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur-sm",
              "bg-gradient-to-br",
              card.accent,
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {card.label}
                </p>
                <div className="mt-1 flex items-end gap-1">
                  <span className="text-2xl font-semibold text-foreground">
                    {card.value}
                  </span>
                  {card.suffix ? (
                    <span className="pb-1 text-sm text-muted-foreground">
                      {card.suffix}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-background/80 text-foreground shadow-inner">
                <Icon className="size-5" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
