"use client"

import * as React from "react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { AcademicPageShell, AcademicPageHeader } from "@/components/academic/academic-shell"
import { CheckCircle, Copy, MessageSquare, Search, Trash2, XCircle } from "lucide-react"

type Status = "running" | "done" | "error" | "cancelled"

interface JobCard {
  sessionId: string
  query: string
  status: Status
  progress: {
    phase: string
    round: number
    totalRounds: number
    queriesFound: number
    sourcesFound: number
    findingsCount: number
    message?: string
  }
  startedAt: number
}

const phaseLabels: Record<string, string> = {
  planning: "Planning",
  searching: "Searching",
  extracting: "Extracting",
  synthesizing: "Synthesizing",
  deciding: "Evaluating",
  finalizing: "Finalizing",
}

function JobCardRunning({ job }: { job: JobCard }) {
  const pct = job.progress.totalRounds > 0
    ? Math.round((job.progress.round / job.progress.totalRounds) * 100)
    : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
        </span>
        <span className="text-xs font-medium text-foreground">
          {phaseLabels[job.progress.phase] || job.progress.phase}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          R{job.progress.round}/{job.progress.totalRounds}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {job.progress.message && (
        <p className="text-xs text-muted-foreground line-clamp-1">{job.progress.message}</p>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="tabular-nums">{job.progress.sourcesFound} sources</span>
        <span className="tabular-nums">{job.progress.findingsCount} findings</span>
      </div>
    </div>
  )
}

function JobCardDone({
  job,
  onCopy,
  onDiscuss,
  onDelete,
}: {
  job: JobCard
  onCopy: () => void
  onDiscuss: () => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="t-success-check" data-state="in" aria-hidden="true">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
        </span>
        <span className="text-sm font-medium text-foreground">Done</span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onCopy}>
          <Copy className="h-3 w-3" />
          Copy Report
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onDiscuss}>
          <MessageSquare className="h-3 w-3" />
          Discuss
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function JobCardError({
  job,
  onRetry,
  onDismiss,
}: {
  job: JobCard
  onRetry: () => void
  onDismiss: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <XCircle className="h-4 w-4 text-red-500" />
        <span className="text-sm font-medium text-foreground">Error</span>
      </div>
      {job.progress.message && (
        <p className="text-xs text-destructive">{job.progress.message}</p>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>
          Retry
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}

export function ResearchPanel({ children, onDiscuss }: { children: React.ReactNode; onDiscuss?: (query: string, report: string) => void }) {
  const [query, setQuery] = React.useState("")
  const [category, setCategory] = React.useState("concept-exploration")
  const [rounds, setRounds] = React.useState(6)
  const [jobs, setJobs] = React.useState<JobCard[]>([])
  const [open, setOpen] = React.useState(false)

  // Listen for progress events
  React.useEffect(() => {
    if (!open) return
    const cleanup = window.ipc.on("research:progress", (data: any) => {
      setJobs(prev => {
        const existing = prev.find(j => j.sessionId === data.sessionId)
        if (existing) {
          return prev.map(j =>
            j.sessionId === data.sessionId
              ? { ...j, status: data.status as Status, progress: data.progress }
              : j
          )
        }
        // New job (started externally, e.g. from agent)
        if (data.status === "running") {
          return [...prev, {
            sessionId: data.sessionId,
            query: "Research task",
            status: "running" as Status,
            progress: data.progress,
            startedAt: Date.now(),
          }]
        }
        return prev
      })
    })
    return cleanup
  }, [open])

  const handleStart = async () => {
    if (!query.trim()) return
    try {
      const { sessionId } = await window.ipc.invoke("research:start", {
        query: query.trim(),
        category: category as any,
        rounds,
      })
      setJobs(prev => [{
        sessionId,
        query: query.trim(),
        status: "running",
        progress: { phase: "planning", round: 0, totalRounds: rounds, queriesFound: 0, sourcesFound: 0, findingsCount: 0 },
        startedAt: Date.now(),
      }, ...prev])
      setQuery("")
    } catch {
      // Handle error silently — user will see error state if it fails
    }
  }

  const handleDelete = async (sessionId: string) => {
    await window.ipc.invoke("research:delete", { sessionId })
    setJobs(prev => prev.filter(j => j.sessionId !== sessionId))
  }

  const handleRetry = async (retryQuery: string) => {
    setQuery(retryQuery)
  }

  const handleDiscuss = async (sessionId: string) => {
    const session = await window.ipc.invoke("research:result", { sessionId })
    if (session?.result && onDiscuss) {
      onDiscuss(session.query, session.result)
    }
  }

  const handleCopy = async (sessionId: string) => {
    const session = await window.ipc.invoke("research:result", { sessionId })
    if (session?.result) {
      await navigator.clipboard.writeText(session.result)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] p-0">
        <AcademicPageShell>
          <AcademicPageHeader
            eyebrow="ScholarOS"
            title="Deep Research"
            description="Multi-round academic research with web search and synthesis"
          />
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* New Research Form */}
            <div className="space-y-3 rounded-lg border p-4">
              <Textarea
                placeholder="What would you like to research?"
                value={query}
                onChange={e => setQuery(e.target.value)}
                rows={3}
              />
              <div className="flex gap-2">
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  <option value="literature-review">Literature Review</option>
                  <option value="compare-contrast">Compare & Contrast</option>
                  <option value="methodology">Methodology / Protocol</option>
                  <option value="fact-check">Fact Check</option>
                  <option value="concept-exploration">Concept Exploration</option>
                  <option value="problem-solving">Problem Solving</option>
                </select>
                <select
                  className="flex h-9 w-20 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={rounds}
                  onChange={e => setRounds(Number(e.target.value))}
                >
                  <option value={4}>4 rds</option>
                  <option value={6}>6 rds</option>
                  <option value={8}>8 rds</option>
                  <option value={12}>12 rds</option>
                </select>
              </div>
              <Button onClick={handleStart} disabled={!query.trim()} className="w-full">
                Start Research
              </Button>
            </div>

            {/* Job Cards */}
            {jobs.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No research sessions yet. Start one above.
              </div>
            )}

            {jobs.map(job => (
              <div key={job.sessionId} className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium truncate">{job.query}</p>

                {job.status === "running" && (
                  <JobCardRunning job={job} />
                )}

                {job.status === "done" && (
                  <JobCardDone
                    job={job}
                    onCopy={() => handleCopy(job.sessionId)}
                    onDiscuss={() => handleDiscuss(job.sessionId)}
                    onDelete={() => handleDelete(job.sessionId)}
                  />
                )}

                {job.status === "error" && (
                  <JobCardError
                    job={job}
                    onRetry={() => handleRetry(job.query)}
                    onDismiss={() => handleDelete(job.sessionId)}
                  />
                )}

                {job.status === "cancelled" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => handleDelete(job.sessionId)}
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            ))}
          </div>
        </AcademicPageShell>
      </SheetContent>
    </Sheet>
  )
}
