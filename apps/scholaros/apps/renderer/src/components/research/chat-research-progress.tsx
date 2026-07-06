"use client"

import * as React from "react"
import type { ResearchProgress } from "@scholaros/shared/src/research.js"
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
  planning: "var(--violet, #7c3aed)",
  searching: "var(--blue, #2563eb)",
  extracting: "var(--emerald, #059669)",
  synthesizing: "var(--amber, #d97706)",
  deciding: "var(--rose, #e11d48)",
  finalizing: "var(--fuchsia, #c026d3)",
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

/* ── Radial progress ring with phase icon ────────────────────────── */

function ProgressRing({
  phase,
  round,
  totalRounds,
}: {
  phase: string
  round: number
  totalRounds: number
}) {
  const pct = totalRounds > 0 ? Math.min(round / totalRounds, 1) : 0
  const r = 26
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - pct)
  const color = phaseColors[phase] || "var(--primary)"
  const isSearching = phase === "searching"
  const isSynthesizing = phase === "synthesizing"

  return (
    <div className="relative shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64">
        {/* track */}
        <circle
          cx="32" cy="32" r={r}
          fill="none"
          stroke="var(--border, #E9E9E7)"
          strokeWidth="3"
        />
        {/* fill */}
        <circle
          cx="32" cy="32" r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "center",
            transition: "stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />

        {isSearching ? (
          /* Globe icon — spinning meridians */
          <g clipPath="url(#globe-clip)">
            <circle cx="32" cy="32" r="11" fill="none" stroke={color} strokeWidth="1.5" />
            <g style={{ animation: "globe-spin 6s linear infinite", transformOrigin: "32px 32px" }}>
              <ellipse cx="32" cy="32" rx="11" ry="4" fill="none" stroke={color} strokeWidth="0.8" opacity="0.4" />
              <ellipse cx="32" cy="32" rx="6" ry="11" fill="none" stroke={color} strokeWidth="0.8" opacity="0.4" />
            </g>
            <line x1="21" y1="32" x2="43" y2="32" stroke={color} strokeWidth="0.8" opacity="0.5" />
            <line x1="22.5" y1="27" x2="41.5" y2="27" stroke={color} strokeWidth="0.6" opacity="0.3" />
            <line x1="22.5" y1="37" x2="41.5" y2="37" stroke={color} strokeWidth="0.6" opacity="0.3" />
          </g>
        ) : isSynthesizing ? (
          /* Gears icon — counter-rotating */
          <g>
            <g style={{ animation: "gear-spin 3s linear infinite", transformOrigin: "28px 30px" }}>
              <circle cx="28" cy="30" r="6" fill="none" stroke={color} strokeWidth="1.2" />
              <circle cx="28" cy="30" r="2" fill={color} opacity="0.6" />
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <line
                  key={deg}
                  x1={28 + Math.cos((deg * Math.PI) / 180) * 5}
                  y1={30 + Math.sin((deg * Math.PI) / 180) * 5}
                  x2={28 + Math.cos((deg * Math.PI) / 180) * 8}
                  y2={30 + Math.sin((deg * Math.PI) / 180) * 8}
                  stroke={color}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              ))}
            </g>
            <g style={{ animation: "gear-spin-reverse 2.4s linear infinite", transformOrigin: "38px 34px" }}>
              <circle cx="38" cy="34" r="4.5" fill="none" stroke={color} strokeWidth="1.2" />
              <circle cx="38" cy="34" r="1.5" fill={color} opacity="0.6" />
              {[0, 72, 144, 216, 288].map((deg) => (
                <line
                  key={deg}
                  x1={38 + Math.cos((deg * Math.PI) / 180) * 3.8}
                  y1={34 + Math.sin((deg * Math.PI) / 180) * 3.8}
                  x2={38 + Math.cos((deg * Math.PI) / 180) * 6}
                  y2={34 + Math.sin((deg * Math.PI) / 180) * 6}
                  stroke={color}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              ))}
            </g>
          </g>
        ) : (
          /* Default: phase initial */
          <text
            x="32" y="33"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={color}
            fontSize="14"
            fontWeight="700"
          >
            {phase === "planning" ? "?" :
             phase === "extracting" ? "E" :
             phase === "deciding" ? "✓" :
             phase === "finalizing" ? "★" : "●"}
          </text>
        )}

        <defs>
          <clipPath id="globe-clip">
            <circle cx="32" cy="32" r="11" />
          </clipPath>
        </defs>
      </svg>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────── */

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
    <div className="relative rounded-xl border bg-card p-4 shadow-sm">
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

      <div className="flex items-start gap-3">
        <div className="relative">
          <ProgressRing
            phase={progress.phase}
            round={progress.round}
            totalRounds={progress.totalRounds}
          />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {formatTime(elapsed)}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* Phase label */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
            </span>
            <span className="text-sm font-medium text-foreground t-text-swap">
              {phaseLabels[progress.phase] || progress.phase}
            </span>
          </div>

          {/* Sub-message */}
          {progress.message && (
            <p className="text-xs text-muted-foreground line-clamp-1 t-text-swap">
              {progress.message}
            </p>
          )}

          {/* Progress bar */}
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progressPct}%`,
                backgroundColor: phaseColors[progress.phase] || "var(--primary)",
              }}
            />
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">
              Round{" "}
              <span className="t-digit-group is-animating">
                <span className="t-digit">{progress.round}</span>
              </span>
              /<span className="t-digit-group is-animating">
                <span className="t-digit">{progress.totalRounds}</span>
              </span>
            </span>
            {progress.sourcesFound > 0 && (
              <span className="tabular-nums">
                <span className="t-digit-group is-animating">
                  <span className="t-digit">{progress.sourcesFound}</span>
                </span>{" "}
                sources
              </span>
            )}
            {progress.findingsCount > 0 && (
              <span className="tabular-nums">
                <span className="t-digit-group is-animating">
                  <span className="t-digit">{progress.findingsCount}</span>
                </span>{" "}
                findings
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
