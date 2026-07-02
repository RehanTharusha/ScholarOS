import * as React from "react";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCardStats, initializeIfNeeded, type ReviewData } from "@/lib/spaced-repetition";

export function ReviewButton({ onClick }: { onClick: () => void }) {
  const [stats, setStats] = useState<ReturnType<typeof getCardStats> | null>(null);

  useEffect(() => {
    let cancelled = false;
    initializeIfNeeded().then((data: ReviewData) => {
      if (!cancelled) setStats(getCardStats(data.cards));
    }).catch(() => {
      if (!cancelled) setStats(null);
    });
    return () => { cancelled = true; };
  }, []);

  const dueCount = stats?.due ?? 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 text-xs font-medium text-muted-foreground",
        "hover:text-foreground transition-colors",
      )}
    >
      Start Review
      {dueCount > 0 && (
        <span className="text-primary">
          ({dueCount} due)
        </span>
      )}
      <ChevronRight className="h-3.5 w-3.5" />
    </button>
  );
}
