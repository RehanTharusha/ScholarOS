import { BrainCircuit, Clock3, Layers3, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AcademicMetricCard } from "@/components/academic/academic-shell";

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
          <AcademicMetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            suffix={card.suffix}
            icon={Icon}
          />
        );
      })}
    </div>
  );
}
