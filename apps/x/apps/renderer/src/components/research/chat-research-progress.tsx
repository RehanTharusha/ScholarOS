"use client"

import * as React from "react"
import type { ResearchProgress } from "@x/shared/src/research.js"
import { X } from "lucide-react"

const phaseLabels: Record<string, string> = {
  planning: "Planning research strategy",
  searching: "Searching for sources",
  extracting: "Extracting key findings",
  synthesizing: "Synthesizing information",
  deciding: "Evaluating completeness",
  finalizing: "Finalizing report",
}

const phaseColors: Record<string, string> = {
  planning: "from-violet-500 to-purple-600",
  searching: "from-blue-500 to-cyan-500",
  extracting: "from-emerald-500 to-teal-500",
  synthesizing: "from-amber-500 to-orange-500",
  deciding: "from-rose-500 to-pink-500",
  finalizing: "from-fuchsia-500 to-purple-600",
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

function SynapseAnimation({ phase, round }: { phase: string; round: number }) {
  const cx = 80, cy = 60
  const totalBranches = 6
  const activeBranches = Math.min(round + 1, totalBranches)

  return (
    <svg width="160" height="120" viewBox="0 0 160 120" className="shrink-0">
      <defs>
        {phase !== "finalizing" && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${cx} ${cy}`}
            to={`360 ${cx} ${cy}`}
            dur="8s"
            repeatCount="indefinite"
          />
        )}
      </defs>

      {/* Glow behind central node */}
      <circle cx={cx} cy={cy} r="20" fill="hsl(var(--primary) / 0.15)" className="animate-pulse">
        {phase !== "finalizing" && (
          <animate attributeName="r" values="18;24;18" dur="2s" repeatCount="indefinite" />
        )}
      </circle>

      {/* Orbiting nodes */}
      {Array.from({ length: totalBranches }).map((_, i) => {
        const angle = (i / totalBranches) * Math.PI * 2 - Math.PI / 2
        const isActive = i < activeBranches
        const orbitR = 38
        const nx = cx + Math.cos(angle) * orbitR
        const ny = cy + Math.sin(angle) * orbitR
        return (
          <g key={`orb-${i}`}>
            <line
              x1={cx} y1={cy} x2={nx} y2={ny}
              stroke={isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
              strokeWidth={isActive ? 1.5 : 0.5}
              opacity={isActive ? 0.5 : 0.15}
            />
            <circle
              cx={nx} cy={ny} r={isActive ? 5 : 3}
              fill={isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
              opacity={isActive ? 0.9 : 0.25}
            >
              {isActive && phase !== "finalizing" && (
                <animate attributeName="r" values="4;6;4" dur="1.5s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
              )}
            </circle>
          </g>
        )
      })}

      {/* Source leaf nodes */}
      {Array.from({ length: 4 }).map((_, i) => {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
        const leafR = 55
        const nx = cx + Math.cos(angle) * leafR
        const ny = cy + Math.sin(angle) * leafR
        return (
          <g key={`leaf-${i}`}>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="hsl(var(--primary))" strokeWidth="0.5" opacity="0.12" />
            <circle cx={nx} cy={ny} r="2.5" fill="hsl(var(--primary))" opacity="0.3" />
          </g>
        )
      })}

      {/* Central node */}
      <circle cx={cx} cy={cy} r="14" fill="hsl(var(--primary))" opacity="0.9">
        {phase !== "finalizing" && (
          <animate attributeName="r" values="13;15;13" dur="2s" repeatCount="indefinite" />
        )}
      </circle>
      <text x={cx} y={cy + 1} textAnchor="middle" fill="white" fontSize="10" fontWeight="700">
        {phase === "planning" ? "?" :
         phase === "searching" ? "S" :
         phase === "extracting" ? "E" :
         phase === "synthesizing" ? "~" :
         phase === "deciding" ? "✓" :
         phase === "finalizing" ? "★" : "R"}
      </text>
    </svg>
  )
}

export function ChatResearchProgress({
  progress,
  startedAt,
  onCancel,
}: {
  progress: ResearchProgress
  startedAt: number
  onCancel?: () => void
}) {
  const [elapsed, setElapsed] = React.useState(0)
  const progressPct = progress.totalRounds > 0
    ? Math.min((progress.round / progress.totalRounds) * 100, 99)
    : 0

  React.useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  return (
    <div className="relative rounded-xl border border-primary/20 bg-gradient-to-br from-background via-primary/[0.02] to-background p-4 shadow-sm">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          aria-label="Cancel research"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <div className="flex items-start gap-4">
        <div className="relative">
          <SynapseAnimation phase={progress.phase} round={progress.round} />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[10px] tabular-nums text-primary">
            {formatTime(elapsed)}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Phase label */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-sm font-medium text-foreground">
              {phaseLabels[progress.phase] || progress.phase}
            </span>
          </div>

          {/* Sub-message */}
          {progress.message && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {progress.message}
            </p>
          )}

          {/* Progress bar */}
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${phaseColors[progress.phase] || "from-primary to-primary"} transition-all duration-500 ease-out`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">Round {progress.round}/{progress.totalRounds}</span>
            {progress.sourcesFound > 0 && (
              <span className="tabular-nums">{progress.sourcesFound} sources</span>
            )}
            {progress.findingsCount > 0 && (
              <span className="tabular-nums">{progress.findingsCount} findings</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
