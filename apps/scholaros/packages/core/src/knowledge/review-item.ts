/** Adapted from nashsu/llm_wiki (GPL v3) — review-utils.ts + review-store.ts */

export interface ReviewOption {
  label: string
  action: string
}

export interface ReviewItem {
  id: string
  type: "contradiction" | "duplicate" | "missing-page" | "confirm" | "suggestion"
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


const REVIEW_TITLE_PREFIX_RE =
  /^(missing[\s-]?page[:：]\s*|duplicate[\s-]?page[:：]\s*|possible[\s-]?duplicate[:：]\s*|缺失页面[:：]\s*|缺少页面[:：]\s*|重复页面[:：]\s*|疑似重复[:：]\s*)/i

export function normalizeReviewTitle(title: string): string {
  return title
    .trimStart()
    .replace(REVIEW_TITLE_PREFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export function reviewIdFor(item: { type: ReviewItem["type"]; title: string }): string {
  const key = `${item.type}::${normalizeReviewTitle(item.title)}`
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `review-${(h >>> 0).toString(16).padStart(8, "0")}`
}

function unionField(a?: string[], b?: string[]): string[] | undefined {
  const merged = Array.from(new Set([...(a ?? []), ...(b ?? [])]))
  return merged.length > 0 ? merged : undefined
}

function mergeOptions(a: ReviewOption[], b: ReviewOption[]): ReviewOption[] {
  const byAction = new Map<string, ReviewOption>()
  for (const option of [...a, ...b]) {
    byAction.set(option.action, option)
  }
  return [...byAction.values()]
}

export function mergeReviewItems(a: ReviewItem, b: ReviewItem): ReviewItem {
  const resolved = a.resolved || b.resolved
  const resolvedAction = resolved ? a.resolvedAction ?? b.resolvedAction : undefined
  return {
    ...a,
    resolved,
    resolvedAction,
    description: a.description || b.description,
    sourcePath: a.sourcePath ?? b.sourcePath,
    affectedPages: unionField(a.affectedPages, b.affectedPages),
    searchQueries: unionField(a.searchQueries, b.searchQueries),
    options: mergeOptions(a.options, b.options),
    createdAt: Math.min(a.createdAt, b.createdAt),
  }
}

export function normalizeReviewItems(items: ReviewItem[]): ReviewItem[] {
  const byId = new Map<string, ReviewItem>()
  for (const raw of items) {
    const remapped: ReviewItem = { ...raw, id: reviewIdFor(raw) }
    const existing = byId.get(remapped.id)
    byId.set(remapped.id, existing ? mergeReviewItems(existing, remapped) : remapped)
  }
  return [...byId.values()]
}
