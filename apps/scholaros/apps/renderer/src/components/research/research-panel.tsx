"use client"

import * as React from "react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { AcademicPageShell, AcademicPageHeader } from "@/components/academic/academic-shell"
import { ResearchSynapse } from "./research-synapse"

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
              <div key={job.sessionId} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{job.query}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {job.status === "running" && (
                        <Badge variant="default" className="animate-pulse">Running</Badge>
                      )}
                      {job.status === "done" && <Badge variant="secondary">Done</Badge>}
                      {job.status === "error" && <Badge variant="destructive">Error</Badge>}
                      {job.status === "cancelled" && <Badge variant="outline">Cancelled</Badge>}
                      {job.status === "running" && (
                        <span className="text-xs text-muted-foreground">
                          {job.progress.phase} • R{job.progress.round}/{job.progress.totalRounds}
                        </span>
                      )}
                    </div>
                  </div>
                  {job.status === "running" && (
                    <ResearchSynapse progress={job.progress} />
                  )}
                </div>

                {job.status === "running" && (
                  <div className="space-y-2">
                    <Progress value={(job.progress.round / job.progress.totalRounds) * 100} />
                    {job.progress.message && (
                      <p className="text-xs text-muted-foreground">{job.progress.message}</p>
                    )}
                  </div>
                )}

                {job.status === "done" && (
                  <div className="space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => handleCopy(job.sessionId)}>
                        Copy Report
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDiscuss(job.sessionId)}>
                        Discuss
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(job.sessionId)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )}

                {job.status === "error" && (
                  <div className="space-y-2">
                    <p className="text-xs text-destructive">{job.progress.message || "Research failed"}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleRetry(job.query)}>
                        Retry
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(job.sessionId)}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}

                {job.status === "cancelled" && (
                  <Button size="sm" variant="outline" onClick={() => handleDelete(job.sessionId)}>
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
