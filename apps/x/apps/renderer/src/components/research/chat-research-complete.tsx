"use client"

import * as React from "react"
import { CheckCircle, Clock, Copy, ExternalLink, FileText, MessageSquare, Quote, ScrollText, Search, Trash2, FileCode2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ResearchSession, ResearchSource, ResearchFinding } from "@x/shared/src/research.js"

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}m ${sec}s`
}

function SourceCard({ source }: { source: ResearchSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 p-2.5 transition-colors hover:bg-muted/60 hover:border-border"
    >
      <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {source.title || source.url}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{source.url}</p>
        {source.snippet && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">{source.snippet}</p>
        )}
      </div>
      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  )
}

function FindingItem({ finding }: { finding: ResearchFinding }) {
  return (
    <div className="group rounded-lg border border-border/40 bg-muted/20 p-3 transition-colors hover:bg-muted/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <a
            href={finding.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            {finding.title}
          </a>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{finding.summary}</p>
        </div>
        <a
          href={finding.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}

export function ChatResearchComplete({
  session,
  onCopy,
  onDelete,
  onDiscuss,
  onShowInPanel,
  onOpenHtml,
}: {
  session: ResearchSession
  onCopy?: () => void
  onDelete?: () => void
  onDiscuss?: () => void
  onShowInPanel?: () => void
  onOpenHtml?: () => void
}) {
  const [showFindings, setShowFindings] = React.useState(false)
  const [showSources, setShowSources] = React.useState(false)
  const [showReport, setShowReport] = React.useState(false)

  const hasFindings = session.findings && session.findings.length > 0
  const hasSources = session.sources && session.sources.length > 0

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-background via-emerald-500/[0.02] to-background p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle className="h-5 w-5 text-emerald-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Research Complete</h3>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Done</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{session.query}</p>
        </div>
      </div>

      {/* Stats row */}
      {session.stats && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(session.stats.duration)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Search className="h-3 w-3" />
            {session.stats.queries} searches
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {session.stats.urls} sources
          </span>
          <span className="inline-flex items-center gap-1">
            <ScrollText className="h-3 w-3" />
            {session.stats.rounds} rounds
          </span>
        </div>
      )}

      {/* Collapsible sections */}
      <div className="mt-3 space-y-1.5">
        {hasSources && (
          <>
            <button
              type="button"
              onClick={() => setShowSources(!showSources)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span>{session.sources.length} Sources</span>
              <span className={`ml-auto transition-transform ${showSources ? "rotate-90" : ""}`}>›</span>
            </button>
            {showSources && (
              <div className="space-y-1.5 pl-1">
                {session.sources.slice(0, 5).map((source, i) => (
                  <SourceCard key={i} source={source} />
                ))}
                {session.sources.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    +{session.sources.length - 5} more sources
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {hasFindings && (
          <>
            <button
              type="button"
              onClick={() => setShowFindings(!showFindings)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <Quote className="h-3.5 w-3.5" />
              <span>{session.findings.length} Key Findings</span>
              <span className={`ml-auto transition-transform ${showFindings ? "rotate-90" : ""}`}>›</span>
            </button>
            {showFindings && (
              <div className="space-y-1.5 pl-1">
                {session.findings.map((finding, i) => (
                  <FindingItem key={i} finding={finding} />
                ))}
              </div>
            )}
          </>
        )}

        {session.result && (
          <button
            type="button"
            onClick={() => setShowReport(!showReport)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <ScrollText className="h-3.5 w-3.5" />
            <span>Full Report</span>
            <span className={`ml-auto transition-transform ${showReport ? "rotate-90" : ""}`}>›</span>
          </button>
        )}
        {showReport && session.result && (
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border/40 bg-muted/20 p-3">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <div className="whitespace-pre-wrap text-xs text-foreground/90 leading-relaxed font-mono">
                {session.result.length > 3000
                  ? session.result.slice(0, 3000) + "\n\n... (report truncated in preview)"
                  : session.result}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onCopy}>
              <Copy className="h-3 w-3" />
              Copy
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Copy full report to clipboard</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onShowInPanel}>
              <Search className="h-3 w-3" />
              Panel
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Show in Research Panel</TooltipContent>
        </Tooltip>
        {onOpenHtml && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onOpenHtml}>
                <FileCode2 className="h-3 w-3" />
                HTML
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Open as formatted HTML report</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onDiscuss}>
              <MessageSquare className="h-3 w-3" />
              Discuss
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Start a new chat about these findings</TooltipContent>
        </Tooltip>
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Delete research session</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
