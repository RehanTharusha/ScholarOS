const NON_KNOWLEDGE_DIRS = ['raw/', 'meta/', 'assets/']

export const isKnowledgeRelPath = (path: string) => {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
  for (const dir of NON_KNOWLEDGE_DIRS) {
    if (normalized.startsWith(dir)) return false
  }
  return true
}

const LEGACY_KNOWLEDGE_PREFIX = 'knowledge/'

const stripLegacyKnowledgePrefix = (path: string) =>
  path.toLowerCase().startsWith(LEGACY_KNOWLEDGE_PREFIX) ? path.slice(LEGACY_KNOWLEDGE_PREFIX.length) : path

export const stripKnowledgePrefix = (path: string) => path

export const normalizeWikiPath = (input: string) => {
  const trimmed = input.trim().replace(/^\/+/, '').replace(/^\.\//, '')
  return stripLegacyKnowledgePrefix(stripKnowledgePrefix(trimmed))
}

export const ensureMarkdownExtension = (path: string) => {
  if (path.toLowerCase().endsWith('.md')) return path
  return `${path}.md`
}

export const toKnowledgePath = (wikiPath: string) => {
  const normalized = normalizeWikiPath(wikiPath)
  if (!normalized || normalized.includes('..') || normalized.endsWith('/')) return null
  return ensureMarkdownExtension(normalized)
}

export const wikiLabel = (wikiPath: string) => {
  const normalized = normalizeWikiPath(wikiPath)
  const name = normalized.split('/').pop() || normalized
  return name.replace(/\.md$/i, '')
}
