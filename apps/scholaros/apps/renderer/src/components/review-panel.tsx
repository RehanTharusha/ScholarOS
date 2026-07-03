import { useEffect, useState, useCallback } from 'react'
import {
  X,
  AlertTriangle,
  Copy,
  FileQuestion,
  CheckCircle2,
  Lightbulb,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ReviewOption {
  label: string
  action: string
}

interface ReviewItem {
  id: string
  type: 'contradiction' | 'duplicate' | 'missing-page' | 'confirm' | 'suggestion'
  title: string
  description: string
  sourcePath?: string
  affectedPages?: string[]
  searchQueries?: string[]
  options: ReviewOption[]
  resolved: boolean
  resolvedAction?: string
  createdAt: number
}

interface ReviewPanelProps {
  onClose: () => void
}

const TYPE_CONFIG = {
  contradiction: {
    icon: AlertTriangle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    label: 'Contradiction',
  },
  duplicate: {
    icon: Copy,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    label: 'Duplicate',
  },
  'missing-page': {
    icon: FileQuestion,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    label: 'Missing Page',
  },
  confirm: {
    icon: CheckCircle2,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    label: 'Confirm',
  },
  suggestion: {
    icon: Lightbulb,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    label: 'Suggestion',
  },
} as const

function formatTime(ts: number): string {
  const d = new Date(ts)
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ReviewPanel({ onClose }: ReviewPanelProps) {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ReviewItem['type'] | 'all'>('all')
  const [error, setError] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const type = filter === 'all' ? undefined : filter
      const result = await window.ipc.invoke('review:getItems', { type })
      setItems(result.items)
    } catch (err) {
      console.error('Failed to load review items:', err)
      setError('Failed to load')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const handleResolve = useCallback(async (id: string, action: string) => {
    try {
      await window.ipc.invoke('review:resolve', { id, action })
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      console.error('Failed to resolve review:', err)
    }
  }, [])

  const handleDismiss = useCallback(async (id: string) => {
    try {
      await window.ipc.invoke('review:dismiss', { id })
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      console.error('Failed to dismiss review:', err)
    }
  }, [])

  const handleClearResolved = useCallback(async () => {
    try {
      await window.ipc.invoke('review:clearResolved', null)
    } catch (err) {
      console.error('Failed to clear resolved:', err)
    }
  }, [])

  const FILTERS: { key: typeof filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: items.length },
    ...(['contradiction', 'duplicate', 'missing-page', 'confirm', 'suggestion'] as const).map(
      (type) => ({
        key: type as typeof filter,
        label: TYPE_CONFIG[type].label,
        count: items.filter((i) => i.type === type).length,
      }),
    ),
  ]

  return (
    <div className="flex flex-col w-[320px] shrink-0 border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Review Queue</span>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground">({items.length})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleClearResolved}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Clear resolved"
            title="Clear resolved items"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => loadItems()}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Close review panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-2 py-2 border-b border-border overflow-x-auto shrink-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-2 py-1 text-xs rounded-md transition-colors whitespace-nowrap',
              filter === f.key
                ? 'bg-accent text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
            )}
          >
            {f.label} {f.count > 0 && `(${f.count})`}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2 text-muted-foreground/40" />
            <span>All clear — no pending reviews</span>
          </div>
        ) : (
          <div className="py-2 space-y-1">
            {items.map((item) => {
              const cfg = TYPE_CONFIG[item.type]
              const Icon = cfg.icon
              return (
                <div
                  key={item.id}
                  className={cn('mx-2 p-3 rounded-lg border', cfg.border, cfg.bg)}
                >
                  {/* Type badge + time */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('h-3.5 w-3.5', cfg.color)} />
                      <span className={cn('text-xs font-medium', cfg.color)}>
                        {cfg.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(item.createdAt)}
                    </span>
                  </div>

                  {/* Title */}
                  <p className="text-sm font-medium text-foreground mb-1">
                    {item.title}
                  </p>

                  {/* Description */}
                  {item.description && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-3">
                      {item.description}
                    </p>
                  )}

                  {/* Affected pages */}
                  {item.affectedPages && item.affectedPages.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {item.affectedPages.map((page) => (
                        <span
                          key={page}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-background/50 text-muted-foreground font-mono"
                        >
                          {page}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Source path */}
                  {item.sourcePath && (
                    <p className="text-[10px] text-muted-foreground/60 mb-2 truncate font-mono">
                      {item.sourcePath}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 mt-2">
                    {item.options.map((option) => (
                      <Button
                        key={option.action}
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => handleResolve(item.id, option.action)}
                      >
                        {option.label}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2 text-muted-foreground ml-auto"
                      onClick={() => handleDismiss(item.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
