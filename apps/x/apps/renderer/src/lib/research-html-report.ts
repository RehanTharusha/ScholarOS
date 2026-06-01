import type { ResearchSession } from "@x/shared/src/research.js"

export function generateResearchHtmlReport(session: ResearchSession): string {
  const title = escapeHtml(session.query)
  const reportContent = session.result ? escapeHtml(session.result).replace(/\n/g, "<br>") : "No report generated."
  const category = session.stats?.category || session.category
  const duration = session.stats ? formatDuration(session.stats.duration) : "—"
  const sources = session.sources || []
  const findings = session.findings || []

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Research Report</title>
<style>
  :root {
    --bg: #faf9f6;
    --card: #ffffff;
    --border: #e5e2dc;
    --text: #1a1a1a;
    --text-muted: #6b6570;
    --primary: #8b5cf6;
    --primary-light: #ede9fe;
    --accent: #f0abfc;
    --font: 'Georgia', 'Times New Roman', serif;
    --font-mono: 'SF Mono', 'Monaco', 'Menlo', monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #121212;
      --card: #1e1e1e;
      --border: #333;
      --text: #e0e0e0;
      --text-muted: #888;
      --primary: #a78bfa;
      --primary-light: #1e1a2e;
    }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    line-height: 1.7;
    padding: 0;
  }
  .container { max-width: 800px; margin: 0 auto; padding: 2rem; }
  .header {
    text-align: center;
    padding: 3rem 1rem 2rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 2rem;
  }
  .header h1 { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; }
  .header .meta {
    display: flex; justify-content: center; gap: 1.5rem;
    margin-top: 1rem; font-size: 0.85rem; color: var(--text-muted);
    font-family: var(--font-mono);
  }
  .section { margin-bottom: 2rem; }
  .section h2 {
    font-size: 1.1rem; font-weight: 600;
    padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);
    margin-bottom: 1rem;
    color: var(--primary);
  }
  .source-list { list-style: none; }
  .source-list li {
    padding: 0.75rem; border: 1px solid var(--border);
    border-radius: 8px; margin-bottom: 0.5rem;
    background: var(--card);
  }
  .source-list li a {
    color: var(--primary); text-decoration: none; font-weight: 500;
  }
  .source-list li a:hover { text-decoration: underline; }
  .source-list li .snippet {
    font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;
  }
  .finding-list { list-style: none; }
  .finding-list li {
    padding: 0.75rem; border: 1px solid var(--border);
    border-radius: 8px; margin-bottom: 0.5rem;
    background: var(--card);
  }
  .finding-list li .finding-title {
    font-weight: 600; margin-bottom: 0.25rem;
  }
  .finding-list li .finding-summary {
    font-size: 0.9rem; color: var(--text-muted);
  }
  .report-body {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 12px; padding: 1.5rem;
    font-size: 0.95rem; line-height: 1.8;
  }
  .stats-bar {
    display: flex; gap: 1rem; flex-wrap: wrap;
    padding: 1rem; background: var(--primary-light);
    border-radius: 8px; margin-bottom: 1.5rem;
    font-size: 0.8rem; font-family: var(--font-mono); color: var(--text-muted);
  }
  .badge {
    display: inline-block; padding: 0.15rem 0.5rem;
    border-radius: 999px; font-size: 0.7rem;
    background: var(--primary-light); color: var(--primary);
    font-family: var(--font-mono); text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  @media print {
    .header { border-bottom-color: #000; }
    .source-list li { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${escapeHtml(session.query)}</h1>
    <div class="meta">
      <span class="badge">${escapeHtml(category)}</span>
      <span>${duration}</span>
      <span>${sources.length} sources</span>
      <span>${session.stats?.rounds || "—"} rounds</span>
    </div>
  </div>

  ${sources.length > 0 ? `
  <div class="section">
    <h2>Sources (${sources.length})</h2>
    <ul class="source-list">
      ${sources.slice(0, 10).map(s => `
      <li>
        <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title || s.url)}</a>
        ${s.snippet ? `<div class="snippet">${escapeHtml(s.snippet)}</div>` : ""}
      </li>`).join("")}
      ${sources.length > 10 ? `<li style="text-align:center;color:var(--text-muted);font-size:0.85rem">+${sources.length - 10} more sources</li>` : ""}
    </ul>
  </div>` : ""}

  ${findings.length > 0 ? `
  <div class="section">
    <h2>Key Findings (${findings.length})</h2>
    <ul class="finding-list">
      ${findings.map(f => `
      <li>
        <div class="finding-title">${escapeHtml(f.title)}</div>
        <div class="finding-summary">${escapeHtml(f.summary)}</div>
      </li>`).join("")}
    </ul>
  </div>` : ""}

  <div class="section">
    <h2>Report</h2>
    <div class="report-body">${reportContent}</div>
  </div>

  <div style="text-align:center;margin-top:3rem;padding-top:1rem;border-top:1px solid var(--border);font-size:0.75rem;color:var(--text-muted)">
    Generated by ScholarOS Deep Research
  </div>
</div>
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}m ${sec}s`
}
