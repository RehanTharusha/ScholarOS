"use client";

import { cn } from "@/lib/utils";

interface IngestModeToggleProps {
  value: "guided" | "autonomous";
  onChange: (mode: "guided" | "autonomous") => void;
}

export function IngestModeToggle({ value, onChange }: IngestModeToggleProps) {
  const options = [
    { value: "autonomous" as const, label: "Autonomous" },
    { value: "guided" as const, label: "Guided" },
  ];

  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-border bg-muted p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-all",
            value === opt.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default IngestModeToggle;
