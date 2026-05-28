import z from "zod";
import { IMonotonicallyIncreasingIdGenerator } from "../application/lib/id-gen.js";
import { WorkDir } from "../config/config.js";
import path from "path";
import fsp from "fs/promises";
import fs from "fs";
import readline from "readline";
import { Run, RunEvent, StartEvent, ListRunsResponse, MessageEvent } from "@x/shared/dist/runs.js";
import { getDefaultModelAndProvider } from "../models/defaults.js";

const LegacyStartEvent = StartEvent.extend({
    model: z.string().optional(),
    provider: z.string().optional(),
});
const ReadRunEvent = RunEvent.or(LegacyStartEvent);

export type CreateRunRepoOptions = {
    agentId: string;
    model: string;
    provider: string;
    projectId?: string;
};

export interface IRunsRepo {
    create(options: CreateRunRepoOptions): Promise<z.infer<typeof Run>>;
    fetch(id: string): Promise<z.infer<typeof Run>>;
    list(cursor?: string, projectId?: string): Promise<z.infer<typeof ListRunsResponse>>;
    listForProject(projectId: string, cursor?: string): Promise<z.infer<typeof ListRunsResponse>>;
    appendEvents(runId: string, events: z.infer<typeof RunEvent>[], projectId?: string): Promise<void>;
    delete(id: string): Promise<void>;
    deleteAll(): Promise<void>;
}

function cleanContentForTitle(content: string): string {
    let cleaned = content.replace(/<attached-files>\s*[\s\S]*?\s*<\/attached-files>/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
}

// Runs index helpers
interface RunsIndex {
    version: number;
    entries: Record<string, string | null>;
}

const INDEX_PATH = path.join(WorkDir, ".runs-index.json");

function getRunsIndexPath(): string {
    return INDEX_PATH;
}

async function loadRunsIndex(): Promise<RunsIndex> {
    try {
        const raw = await fsp.readFile(getRunsIndexPath(), "utf-8");
        return JSON.parse(raw);
    } catch {
        return { version: 1, entries: {} };
    }
}

async function saveRunsIndex(index: RunsIndex): Promise<void> {
    await fsp.writeFile(getRunsIndexPath(), JSON.stringify(index, null, 2), "utf-8");
}

async function updateIndexForRun(runId: string, projectId: string | null): Promise<void> {
    const index = await loadRunsIndex();
    index.entries[runId] = projectId;
    await saveRunsIndex(index);
}

async function removeIndexForRun(runId: string): Promise<void> {
    const index = await loadRunsIndex();
    delete index.entries[runId];
    await saveRunsIndex(index);
}

function runsDirForProject(projectId?: string): string {
    if (projectId) {
        return path.join(WorkDir, "projects", projectId, "runs");
    }
    return path.join(WorkDir, "runs");
}

export class FSRunsRepo implements IRunsRepo {
    private idGenerator: IMonotonicallyIncreasingIdGenerator;
    constructor({
        idGenerator,
    }: {
        idGenerator: IMonotonicallyIncreasingIdGenerator;
    }) {
        this.idGenerator = idGenerator;
        fsp.mkdir(path.join(WorkDir, 'runs'), { recursive: true });
    }

    private extractTitle(events: z.infer<typeof RunEvent>[]): string | undefined {
        for (const event of events) {
            if (event.type === 'message') {
                const messageEvent = event as z.infer<typeof MessageEvent>;
                if (messageEvent.message.role === 'user') {
                    const content = messageEvent.message.content;
                    let textContent: string | undefined;
                    if (typeof content === 'string') {
                        textContent = content;
                    } else {
                        textContent = content
                            .filter(p => p.type === 'text')
                            .map(p => p.text)
                            .join('');
                    }
                    if (textContent && textContent.trim()) {
                        const cleaned = cleanContentForTitle(textContent);
                        if (!cleaned) continue;
                        return cleaned.length > 100 ? cleaned.substring(0, 100) : cleaned;
                    }
                }
            }
        }
        return undefined;
    }

    private async readRunMetadata(filePath: string): Promise<{
        start: z.infer<typeof LegacyStartEvent>;
        title: string | undefined;
    } | null> {
        return new Promise((resolve) => {
            const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
            const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

            let start: z.infer<typeof LegacyStartEvent> | null = null;
            let title: string | undefined;
            let lineIndex = 0;

            rl.on('line', (line) => {
                const trimmed = line.trim();
                if (!trimmed) return;

                try {
                    if (lineIndex === 0) {
                        start = LegacyStartEvent.parse(JSON.parse(trimmed));
                    } else {
                        const event = ReadRunEvent.parse(JSON.parse(trimmed));
                        if (event.type === 'message') {
                            const msg = event.message;
                            if (msg.role === 'user') {
                                const content = msg.content;
                                let textContent: string | undefined;
                                if (typeof content === 'string') {
                                    textContent = content;
                                } else {
                                    textContent = content
                                        .filter(p => p.type === 'text')
                                        .map(p => p.text)
                                        .join('');
                                }
                                if (textContent && textContent.trim()) {
                                    const cleaned = cleanContentForTitle(textContent);
                                    if (cleaned) {
                                        title = cleaned.length > 100 ? cleaned.substring(0, 100) : cleaned;
                                    }
                                }
                                rl.close();
                                stream.destroy();
                                return;
                            } else if (msg.role === 'assistant') {
                                rl.close();
                                stream.destroy();
                                return;
                            }
                        }
                    }
                    lineIndex++;
                } catch {
                    // Skip malformed lines
                }
            });

            rl.on('close', () => {
                if (start) {
                    resolve({ start, title });
                } else {
                    resolve(null);
                }
            });

            rl.on('error', () => {
                resolve(null);
            });

            stream.on('error', () => {
                rl.close();
                resolve(null);
            });
        });
    }

    async appendEvents(runId: string, events: z.infer<typeof RunEvent>[], projectId?: string): Promise<void> {
        const dir = runsDirForProject(projectId);
        await fsp.mkdir(dir, { recursive: true });
        await fsp.appendFile(
            path.join(dir, `${runId}.jsonl`),
            events.map(event => JSON.stringify(event)).join("\n") + "\n"
        );
    }

    async create(options: CreateRunRepoOptions): Promise<z.infer<typeof Run>> {
        const runId = await this.idGenerator.next();
        const ts = new Date().toISOString();
        const start: z.infer<typeof StartEvent> = {
            type: "start",
            runId,
            agentName: options.agentId,
            model: options.model,
            provider: options.provider,
            subflow: [],
            ts,
        };

        const dir = runsDirForProject(options.projectId);
        await fsp.mkdir(dir, { recursive: true });
        await this.appendEvents(runId, [start], options.projectId);

        // Update runs index
        await updateIndexForRun(runId, options.projectId ?? null);

        return {
            id: runId,
            createdAt: ts,
            agentId: options.agentId,
            model: options.model,
            provider: options.provider,
            projectId: options.projectId,
            log: [start],
        };
    }

    async fetch(id: string): Promise<z.infer<typeof Run>> {
        // Try to find the run in any location
        const index = await loadRunsIndex();
        const projectId = index.entries[id] ?? undefined;
        const dir = runsDirForProject(projectId);
        const filePath = path.join(dir, `${id}.jsonl`);

        if (!fs.existsSync(filePath)) {
            // Fall back to scanning all locations
            const globalPath = path.join(WorkDir, 'runs', `${id}.jsonl`);
            if (fs.existsSync(globalPath)) {
                return this.readFile(globalPath, id);
            }
            // Scan project dirs
            const projectsDir = path.join(WorkDir, 'projects');
            if (fs.existsSync(projectsDir)) {
                const entries = await fsp.readdir(projectsDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && entry.name.startsWith('proj_')) {
                        const p = path.join(projectsDir, entry.name, 'runs', `${id}.jsonl`);
                        if (fs.existsSync(p)) {
                            return this.readFile(p, id);
                        }
                    }
                }
            }
            throw new Error(`Run ${id} not found`);
        }

        return this.readFile(filePath, id);
    }

    private async readFile(filePath: string, id: string): Promise<z.infer<typeof Run>> {
        const contents = await fsp.readFile(filePath, 'utf8');
        const rawEvents = contents.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => ReadRunEvent.parse(JSON.parse(line)));
        if (rawEvents.length === 0 || rawEvents[0].type !== 'start') {
            throw new Error('Corrupt run data');
        }
        const rawStart = rawEvents[0];
        const defaults = (!rawStart.model || !rawStart.provider)
            ? await getDefaultModelAndProvider()
            : null;
        const start: z.infer<typeof StartEvent> = {
            ...rawStart,
            model: rawStart.model ?? defaults!.model,
            provider: rawStart.provider ?? defaults!.provider,
        };
        const events: z.infer<typeof RunEvent>[] = [start, ...rawEvents.slice(1) as z.infer<typeof RunEvent>[]];
        const title = this.extractTitle(events);

        // Get projectId from index
        const index = await loadRunsIndex();
        const projectId = index.entries[id] ?? undefined;

        return {
            id,
            title,
            createdAt: start.ts!,
            agentId: start.agentName,
            model: start.model,
            provider: start.provider,
            projectId,
            log: events,
        };
    }

    async list(cursor?: string, projectId?: string): Promise<z.infer<typeof ListRunsResponse>> {
        if (projectId) {
            return this.listForProject(projectId, cursor);
        }
        return this.listAll(cursor);
    }

    async listForProject(projectId: string, cursor?: string): Promise<z.infer<typeof ListRunsResponse>> {
        const runsDir = runsDirForProject(projectId);
        return this.listFromDir(runsDir, cursor);
    }

    private async listAll(cursor?: string): Promise<z.infer<typeof ListRunsResponse>> {
        const PAGE_SIZE = 20;

        // Collect all run files from all locations
        type RunEntry = { runId: string; projectId: string | null; filePath: string };
        const allRuns: RunEntry[] = [];

        // Global runs
        const globalDir = path.join(WorkDir, 'runs');
        if (fs.existsSync(globalDir)) {
            try {
                const entries = await fsp.readdir(globalDir, { withFileTypes: true });
                for (const e of entries) {
                    if (e.isFile() && e.name.endsWith('.jsonl')) {
                        const runId = e.name.slice(0, -6);
                        allRuns.push({ runId, projectId: null, filePath: path.join(globalDir, e.name) });
                    }
                }
            } catch { /* ignore */ }
        }

        // Project runs
        const projectsDir = path.join(WorkDir, 'projects');
        if (fs.existsSync(projectsDir)) {
            try {
                const entries = await fsp.readdir(projectsDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && entry.name.startsWith('proj_')) {
                        const projRunsDir = path.join(projectsDir, entry.name, 'runs');
                        if (fs.existsSync(projRunsDir)) {
                            const runEntries = await fsp.readdir(projRunsDir, { withFileTypes: true });
                            for (const re of runEntries) {
                                if (re.isFile() && re.name.endsWith('.jsonl')) {
                                    const runId = re.name.slice(0, -6);
                                    allRuns.push({ runId, projectId: entry.name, filePath: path.join(projRunsDir, re.name) });
                                }
                            }
                        }
                    }
                }
            } catch { /* ignore */ }
        }

        // Sort by filename descending (newest first)
        allRuns.sort((a, b) => path.basename(b.filePath).localeCompare(path.basename(a.filePath)));

        // Pagination
        let startIndex = 0;
        if (cursor) {
            const idx = allRuns.findIndex(r => r.runId === cursor);
            startIndex = idx >= 0 ? idx + 1 : 0;
        }

        const selected = allRuns.slice(startIndex, startIndex + PAGE_SIZE);
        const runs: z.infer<typeof ListRunsResponse>['runs'] = [];

        for (const entry of selected) {
            const metadata = await this.readRunMetadata(entry.filePath);
            if (!metadata) continue;
            runs.push({
                id: entry.runId,
                title: metadata.title,
                createdAt: metadata.start.ts!,
                agentId: metadata.start.agentName,
                projectId: entry.projectId ?? undefined,
            });
        }

        const hasMore = startIndex + PAGE_SIZE < allRuns.length;
        const nextCursor = hasMore && selected.length > 0
            ? selected[selected.length - 1].runId
            : undefined;

        return { runs, ...(nextCursor ? { nextCursor } : {}) };
    }

    private async listFromDir(dir: string, cursor?: string): Promise<z.infer<typeof ListRunsResponse>> {
        const PAGE_SIZE = 20;
        let files: string[] = [];
        try {
            const entries = await fsp.readdir(dir, { withFileTypes: true });
            files = entries
                .filter(e => e.isFile() && e.name.endsWith('.jsonl'))
                .map(e => e.name);
        } catch (err: unknown) {
            const e = err as { code?: string };
            if (e.code === 'ENOENT') {
                return { runs: [] };
            }
            throw err;
        }

        files.sort((a, b) => b.localeCompare(a));

        const cursorFile = cursor;
        let startIndex = 0;
        if (cursorFile) {
            const exact = files.indexOf(cursorFile);
            if (exact >= 0) {
                startIndex = exact + 1;
            } else {
                const firstOlder = files.findIndex(name => name.localeCompare(cursorFile) < 0);
                startIndex = firstOlder === -1 ? files.length : firstOlder;
            }
        }

        const selected = files.slice(startIndex, startIndex + PAGE_SIZE);
        const runs: z.infer<typeof ListRunsResponse>['runs'] = [];

        for (const name of selected) {
            const runId = name.slice(0, -'.jsonl'.length);
            const metadata = await this.readRunMetadata(path.join(dir, name));
            if (!metadata) continue;

            // Determine projectId from index
            const index = await loadRunsIndex();
            const projectId = index.entries[runId] ?? undefined;

            runs.push({
                id: runId,
                title: metadata.title,
                createdAt: metadata.start.ts!,
                agentId: metadata.start.agentName,
                projectId,
            });
        }

        const hasMore = startIndex + PAGE_SIZE < files.length;
        const nextCursor = hasMore && selected.length > 0
            ? selected[selected.length - 1]
            : undefined;

        return { runs, ...(nextCursor ? { nextCursor } : {}) };
    }

    async delete(id: string): Promise<void> {
        // Find the file
        const index = await loadRunsIndex();
        const projectId = index.entries[id] ?? undefined;
        const dir = runsDirForProject(projectId);
        const filePath = path.join(dir, `${id}.jsonl`);

        if (fs.existsSync(filePath)) {
            await fsp.unlink(filePath);
        }

        await removeIndexForRun(id);
    }

    async deleteAll(): Promise<void> {
        // Delete global runs
        const runsDir = path.join(WorkDir, 'runs');
        let entries: string[];
        try {
            entries = await fsp.readdir(runsDir);
        } catch (err: unknown) {
            const e = err as { code?: string };
            if (e.code !== 'ENOENT') throw err;
            entries = [];
        }
        const files = entries.filter(e => e.endsWith('.jsonl'));
        await Promise.all(files.map(f => fsp.unlink(path.join(runsDir, f)).catch(() => {})));

        // Delete project runs
        const projectsDir = path.join(WorkDir, 'projects');
        if (fs.existsSync(projectsDir)) {
            try {
                const projEntries = await fsp.readdir(projectsDir, { withFileTypes: true });
                for (const entry of projEntries) {
                    if (entry.isDirectory() && entry.name.startsWith('proj_')) {
                        const projRunsDir = path.join(projectsDir, entry.name, 'runs');
                        if (fs.existsSync(projRunsDir)) {
                            const runFiles = await fsp.readdir(projRunsDir);
                            await Promise.all(
                                runFiles.filter(f => f.endsWith('.jsonl')).map(f =>
                                    fsp.unlink(path.join(projRunsDir, f)).catch(() => {})
                                )
                            );
                        }
                    }
                }
            } catch { /* ignore */ }
        }

        // Reset index
        await saveRunsIndex({ version: 1, entries: {} });
    }
}
