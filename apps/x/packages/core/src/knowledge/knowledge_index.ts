import fs from 'fs';
import path from 'path';
import { WorkDir } from '../config/config.js';

const KNOWLEDGE_DIR = path.join(WorkDir, 'knowledge');

/**
 * Index entry for a course note
 */
interface CourseEntry {
    file: string;
    name: string;
}

/**
 * Index entry for a concept note
 */
interface ConceptEntry {
    file: string;
    name: string;
    course?: string;
    keywords: string[];
}

/**
 * Index entry for a lecture note
 */
interface LectureEntry {
    file: string;
    name: string;
    course?: string;
    date?: string;
}

/**
 * Index entry for an assignment note
 */
interface AssignmentEntry {
    file: string;
    name: string;
    course?: string;
    status?: string;
    due?: string;
}

/**
 * Index entry for a paper note
 */
interface PaperEntry {
    file: string;
    name: string;
    authors?: string;
    year?: string;
}

/**
 * Index entry for notes in other folders (generic)
 */
interface OtherEntry {
    file: string;
    name: string;
    folder: string;
}

/**
 * The complete knowledge index for ScholarOS
 */
export interface KnowledgeIndex {
    courses: CourseEntry[];
    concepts: ConceptEntry[];
    lectures: LectureEntry[];
    assignments: AssignmentEntry[];
    papers: PaperEntry[];
    syntheses: OtherEntry[];
    resources: OtherEntry[];
    entities: OtherEntry[];
    other: OtherEntry[];
    buildTime: string;
}

/**
 * Extract the title (first H1) from markdown content
 */
function extractTitle(content: string): string {
    const match = content.match(/^#\s+(.+?)$/m);
    return match ? match[1].trim() : '';
}

/**
 * Extract a field value from markdown content.
 * Looks for patterns like **Field:** value or **Field:** [[Link]]
 */
function extractField(content: string, fieldName: string): string | undefined {
    const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?:\\n|$)`, 'i');
    const match = content.match(pattern);
    if (match) {
        let value = match[1].trim();
        const linkMatch = value.match(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/);
        if (linkMatch) {
            value = linkMatch[1];
        }
        return value || undefined;
    }
    return undefined;
}

/**
 * Extract comma-separated values from a field
 */
function extractList(content: string, fieldName: string): string[] {
    const value = extractField(content, fieldName);
    if (!value) return [];
    return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Recursively scan a directory for markdown files
 */
function scanDirectoryRecursive(dir: string): string[] {
    if (!fs.existsSync(dir)) {
        return [];
    }

    const files: string[] = [];
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            files.push(...scanDirectoryRecursive(fullPath));
        } else if (stat.isFile() && entry.endsWith('.md')) {
            files.push(fullPath);
        }
    }

    return files;
}

/**
 * Determine the folder type from the relative path.
 * Returns the top-level category (courses, papers, syntheses, etc.) and optionally the subfolder info.
 */
function getFolderInfo(filePath: string): { category: string; subfolder?: string; course?: string } {
    const relativePath = path.relative(KNOWLEDGE_DIR, filePath);
    const parts = relativePath.split(path.sep);

    if (parts.length === 1) {
        return { category: 'root' };
    }

    const category = parts[0].toLowerCase();

    if (category === 'courses' && parts.length >= 3) {
        return { category: 'courses', course: parts[1], subfolder: parts[2] };
    }

    return { category };
}

/**
 * Build a complete index of the ScholarOS knowledge base.
 */
export function buildKnowledgeIndex(): KnowledgeIndex {
    const index: KnowledgeIndex = {
        courses: [],
        concepts: [],
        lectures: [],
        assignments: [],
        papers: [],
        syntheses: [],
        resources: [],
        entities: [],
        other: [],
        buildTime: new Date().toISOString(),
    };

    const allFiles = scanDirectoryRecursive(KNOWLEDGE_DIR);

    for (const filePath of allFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const { category, course, subfolder } = getFolderInfo(filePath);
            const name = extractTitle(content);
            const relativePath = path.relative(KNOWLEDGE_DIR, filePath);

            if (category === 'courses') {
                // This is under courses/
                if (subfolder === 'concepts') {
                    index.concepts.push({
                        file: relativePath,
                        name,
                        course,
                        keywords: extractList(content, 'Tags'),
                    });
                } else if (subfolder === 'lectures') {
                    index.lectures.push({
                        file: relativePath,
                        name,
                        course,
                        date: extractField(content, 'Date'),
                    });
                } else if (subfolder === 'assignments') {
                    index.assignments.push({
                        file: relativePath,
                        name,
                        course,
                        status: extractField(content, 'Status'),
                        due: extractField(content, 'Due'),
                    });
                } else if (!subfolder && filePath.endsWith('index.md')) {
                    // Course index file
                    index.courses.push({
                        file: relativePath,
                        name: course ?? name,
                    });
                } else {
                    index.other.push({ file: relativePath, name, folder: category });
                }
            } else if (category === 'papers') {
                index.papers.push({
                    file: relativePath,
                    name,
                    authors: extractField(content, 'Authors'),
                    year: extractField(content, 'Year'),
                });
            } else if (category === 'syntheses') {
                index.syntheses.push({ file: relativePath, name, folder: category });
            } else if (category === 'resources') {
                index.resources.push({ file: relativePath, name, folder: category });
            } else if (category === 'entities') {
                index.entities.push({ file: relativePath, name, folder: category });
            } else {
                index.other.push({ file: relativePath, name, folder: category });
            }
        } catch (error) {
            console.error(`Error parsing note ${filePath}:`, error);
        }
    }

    return index;
}

/**
 * Format the index as a string for inclusion in agent prompts
 */
export function formatIndexForPrompt(index: KnowledgeIndex): string {
    let output = '# Existing Knowledge Base Index\n\n';
    output += `Built at: ${index.buildTime}\n\n`;

    // Courses
    output += '## Courses\n\n';
    if (index.courses.length === 0) {
        output += '_No course overview pages yet_\n\n';
    } else {
        output += '| File | Name |\n';
        output += '|------|------|\n';
        for (const c of index.courses) {
            output += `| ${c.file} | ${c.name} |\n`;
        }
        output += '\n';
    }

    // Concepts
    output += '## Concepts\n\n';
    if (index.concepts.length === 0) {
        output += '_No concept notes yet_\n\n';
    } else {
        output += '| File | Name | Course | Keywords |\n';
        output += '|------|------|--------|----------|\n';
        for (const c of index.concepts) {
            const course = c.course ?? '-';
            const keywords = c.keywords.length > 0 ? c.keywords.join(', ') : '-';
            output += `| ${c.file} | ${c.name} | ${course} | ${keywords} |\n`;
        }
        output += '\n';
    }

    // Lectures
    output += '## Lectures\n\n';
    if (index.lectures.length === 0) {
        output += '_No lecture notes yet_\n\n';
    } else {
        output += '| File | Name | Course | Date |\n';
        output += '|------|------|--------|------|\n';
        for (const l of index.lectures) {
            const course = l.course ?? '-';
            const date = l.date ?? '-';
            output += `| ${l.file} | ${l.name} | ${course} | ${date} |\n`;
        }
        output += '\n';
    }

    // Assignments
    output += '## Assignments\n\n';
    if (index.assignments.length === 0) {
        output += '_No assignment notes yet_\n\n';
    } else {
        output += '| File | Name | Course | Status | Due |\n';
        output += '|------|------|--------|--------|-----|\n';
        for (const a of index.assignments) {
            const course = a.course ?? '-';
            const status = a.status ?? '-';
            const due = a.due ?? '-';
            output += `| ${a.file} | ${a.name} | ${course} | ${status} | ${due} |\n`;
        }
        output += '\n';
    }

    // Papers
    output += '## Papers\n\n';
    if (index.papers.length === 0) {
        output += '_No paper notes yet_\n\n';
    } else {
        output += '| File | Name | Authors | Year |\n';
        output += '|------|------|---------|------|\n';
        for (const p of index.papers) {
            const authors = p.authors ?? '-';
            const year = p.year ?? '-';
            output += `| ${p.file} | ${p.name} | ${authors} | ${year} |\n`;
        }
        output += '\n';
    }

    // Syntheses
    if (index.syntheses.length > 0) {
        output += '## Syntheses\n\n';
        output += '| File | Name |\n';
        output += '|------|------|\n';
        for (const s of index.syntheses) {
            output += `| ${s.file} | ${s.name} |\n`;
        }
        output += '\n';
    }

    // Resources
    if (index.resources.length > 0) {
        output += '## Resources\n\n';
        output += '| File | Name |\n';
        output += '|------|------|\n';
        for (const r of index.resources) {
            output += `| ${r.file} | ${r.name} |\n`;
        }
        output += '\n';
    }

    // Entities
    if (index.entities.length > 0) {
        output += '## Entities\n\n';
        output += '| File | Name |\n';
        output += '|------|------|\n';
        for (const e of index.entities) {
            output += `| ${e.file} | ${e.name} |\n`;
        }
        output += '\n';
    }

    // Other
    if (index.other.length > 0) {
        output += '## Other Notes\n\n';
        output += '| File | Name | Folder |\n';
        output += '|------|------|--------|\n';
        for (const note of index.other) {
            output += `| ${note.file} | ${note.name} | ${note.folder} |\n`;
        }
        output += '\n';
    }

    return output;
}
