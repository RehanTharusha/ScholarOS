import { AlertTriangle } from "lucide-react";
import type { Contradiction } from "@x/shared/dist/academic.js";

export function ContradictionDialog({
  contradictions,
}: {
  contradictions: Contradiction[];
}) {
  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4">
      <div className="flex items-center gap-2 text-amber-100">
        <AlertTriangle className="size-4" />
        <p className="text-sm font-medium">Potential contradictions detected</p>
      </div>

      <div className="mt-3 space-y-3 text-sm text-amber-50">
        {contradictions.map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-amber-200/20 bg-black/20 p-3"
          >
            <p className="font-medium">{item.claim1}</p>
            <p className="mt-1 text-xs opacity-80">Source: {item.source1}</p>
            <p className="mt-2 font-medium">{item.claim2}</p>
            <p className="mt-1 text-xs opacity-80">Source: {item.source2}</p>
            <p className="mt-2 text-xs">
              Confidence: {Math.round(item.confidence * 100)}%
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
