import { useEffect, useId, useRef, useState, useCallback } from 'react'
import mermaid from 'mermaid'
import { useTheme } from '@/contexts/theme-context'
import { DownloadIcon } from 'lucide-react'
import { toast } from 'sonner'

let lastTheme: string | null = null

function ensureInit(theme: 'default' | 'dark') {
  if (lastTheme === theme) return
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'strict',
  })
  lastTheme = theme
}

interface MermaidRendererProps {
  source: string
  className?: string
}

function extractTopic(source: string): string {
  const firstLine = source.trim().split('\n')[0] || 'diagram'
  const cleaned = firstLine
    .replace(/^(mindmap\s+)?root\(\(/, '')
    .replace(/\)\)$/, '')
    .replace(/^root\[/, '')
    .replace(/\]$/, '')
    .trim()
  return cleaned || 'diagram'
}

export function MermaidRenderer({ source, className }: MermaidRendererProps) {
  const { resolvedTheme } = useTheme()
  const id = useId().replace(/:/g, '-')
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!source.trim()) {
      setSvg(null)
      setError(null)
      return
    }

    let cancelled = false
    const mermaidTheme = resolvedTheme === 'dark' ? 'dark' : 'default'
    ensureInit(mermaidTheme)

    mermaid
      .render(`mermaid-${id}`, source.trim())
      .then(({ svg: renderedSvg }) => {
        if (!cancelled) {
          setSvg(renderedSvg)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSvg(null)
          setError(err instanceof Error ? err.message : 'Failed to render diagram')
        }
      })

    return () => {
      cancelled = true
    }
  }, [source, resolvedTheme, id])

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const topic = extractTopic(source)
      const safeName = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram'

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mind Map — ${topic}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({ startOnLoad: true, theme: "${resolvedTheme === 'dark' ? 'dark' : 'default'}", securityLevel: "loose" });</script>
  <style>
    body { background: #fff; margin: 0; padding: 1rem; font-family: sans-serif; }
    .mermaid-container { max-width: 1000px; margin: 0 auto; }
    .mermaid-container svg { max-width: 100%; height: auto !important; display: block !important; }
  </style>
</head>
<body>
  <div class="mermaid-container">
    <pre class="mermaid">
${source.trim()}
    </pre>
  </div>
</body>
</html>`

      const path = `mindmaps/${safeName}.html`
      await window.ipc.invoke('workspace:writeFile', {
        path,
        data: html,
        opts: { mkdirp: true },
      })
      toast(`Saved to ${path}`)
    } catch {
      toast('Failed to save mind map')
    } finally {
      setSaving(false)
    }
  }, [source, resolvedTheme, saving])

  if (error) {
    return (
      <div className={className}>
        <div style={{ color: 'var(--destructive, #ef4444)', fontSize: 12, marginBottom: 4 }}>
          Invalid mermaid syntax
        </div>
        <pre style={{ fontSize: 12, opacity: 0.7, whiteSpace: 'pre-wrap', margin: 0 }}>
          <code>{source}</code>
        </pre>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className={className} style={{ fontSize: 13, opacity: 0.5 }}>
        Rendering diagram...
      </div>
    )
  }

  return (
    <div className="group relative">
      <div
        ref={containerRef}
        className={className}
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ lineHeight: 0 }}
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="absolute bottom-2 right-2 size-7 rounded-md bg-background/80 p-1.5 opacity-0 backdrop-blur-sm transition-opacity hover:bg-background group-hover:opacity-100 disabled:opacity-40 border border-border"
        title="Save as HTML — open in browser to view, right-click diagram to save as image"
      >
        <DownloadIcon className="size-full" />
      </button>
    </div>
  )
}
