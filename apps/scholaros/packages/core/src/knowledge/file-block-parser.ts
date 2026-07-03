/** Adapted from nashsu/llm_wiki (GPL v3) — parseFileBlocks in ingest.rs */

const FILE_BLOCK_REGEX = /---FILE:\s*(.+?)\s*---\n([\s\S]*?)---END FILE---/g;

export interface FileBlock {
  path: string;
  content: string;
}

export function parseFileBlocks(text: string): FileBlock[] {
  const blocks: FileBlock[] = [];
  const matches = text.matchAll(FILE_BLOCK_REGEX);
  for (const match of matches) {
    blocks.push({
      path: match[1].trim(),
      content: match[2].trim(),
    });
  }
  return blocks;
}
