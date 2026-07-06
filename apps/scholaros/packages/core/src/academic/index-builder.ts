/**
 * Deterministic index builder (3.3, 3.4).
 * Regenerates course-level index.md files from the folder listing + frontmatter.
 * No LLM call — purely deterministic file operations.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { getScholarOSPath } from "../config/config.js";
import { glob } from "glob";

export type IndexEntry = {
  path: string;
  title: string;
  tags: string[];
  prerequisites: string[];
};

/**
 * Scan a course folder and build its index.md content.
 */
export async function buildCourseIndex(courseDir: string): Promise<string> {
  const absDir = path.join(getScholarOSPath("courses"), courseDir);
  const conceptFiles = await glob("concepts/*.md", { cwd: absDir });
  const lectureFiles = await glob("lectures/*.md", { cwd: absDir });
  const assignmentFiles = await glob("assignments/*.md", { cwd: absDir });

  const lines: string[] = [
    `# ${path.basename(courseDir)}`,
    "",
    `> Auto-generated index. Last updated: ${new Date().toISOString().split("T")[0]}`,
    "",
  ];

  if (conceptFiles.length > 0) {
    lines.push("## Concepts", "");
    for (const f of conceptFiles.sort()) {
      const title = f.replace(/\.md$/, "").replace("concepts/", "");
      lines.push(`- [[courses/${courseDir}/concepts/${title}|${title}]]`);
    }
    lines.push("");
  }

  if (lectureFiles.length > 0) {
    lines.push("## Lectures", "");
    for (const f of lectureFiles.sort()) {
      const title = f.replace(/\.md$/, "").replace("lectures/", "");
      lines.push(`- [[courses/${courseDir}/lectures/${title}|${title}]]`);
    }
    lines.push("");
  }

  if (assignmentFiles.length > 0) {
    lines.push("## Assignments", "");
    for (const f of assignmentFiles.sort()) {
      const title = f.replace(/\.md$/, "").replace("assignments/", "");
      lines.push(`- [[courses/${courseDir}/assignments/${title}|${title}]]`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build or rebuild the index.md for a specific course folder.
 * Returns true if the file was written, false if unchanged.
 */
export async function regenerateCourseIndex(courseDir: string): Promise<boolean> {
  const absDir = path.join(getScholarOSPath("courses"), courseDir);
  const indexPath = path.join(absDir, "index.md");

  const content = await buildCourseIndex(courseDir);
  const dirStat = await fs.stat(absDir).catch(() => null);
  if (!dirStat?.isDirectory()) return false;

  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, content, "utf8");
  return true;
}

/**
 * Extract section headers from markdown content deterministically.
 * Used by readOpenContext and the section splitter (3.3).
 */
export function extractSections(markdown: string): { header: string; level: number; content: string }[] {
  const lines = markdown.split("\n");
  const sections: { header: string; level: number; content: string }[] = [];
  let currentHeader = "";
  let currentLevel = 0;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      if (currentHeader) {
        sections.push({ header: currentHeader, level: currentLevel, content: currentContent.join("\n").trim() });
      }
      currentHeader = headerMatch[2].trim();
      currentLevel = headerMatch[1].length;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentHeader) {
    sections.push({ header: currentHeader, level: currentLevel, content: currentContent.join("\n").trim() });
  }

  return sections;
}
