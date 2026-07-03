import fsp from "fs/promises";
import path from "path";
import { EventEmitter } from "events";
import { getScholarOSPath } from "../config/config.js";

export type QueueItemStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface QueueItem {
  id: string;
  sourcePath: string;
  fileName: string;
  status: QueueItemStatus;
  retryCount: number;
  maxRetries: number;
  progress: number;
  stage: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface QueueData {
  items: QueueItem[];
}

export type QueueProgressEvent = {
  itemId: string;
  progress: number;
  stage: string;
  fileName: string;
};

export type QueueStatusEvent = {
  itemId: string;
  status: QueueItemStatus;
  fileName: string;
  error?: string;
};

type IngestQueueEventMap = {
  progress: (event: QueueProgressEvent) => void;
  status: (event: QueueStatusEvent) => void;
  drain: () => void;
};

export class IngestQueue extends EventEmitter {
  private items: QueueItem[] = [];
  private loaded = false;
  private filePath: string;

  constructor() {
    super();
    this.filePath = path.join(
      getScholarOSPath(".knowledge-graph"),
      "ingest-queue.json",
    );
  }

  on<E extends keyof IngestQueueEventMap>(
    event: E,
    listener: IngestQueueEventMap[E],
  ): this {
    return super.on(event as string, listener as (...args: unknown[]) => void);
  }

  emit<E extends keyof IngestQueueEventMap>(
    event: E,
    ...args: Parameters<IngestQueueEventMap[E]>
  ): boolean {
    return super.emit(event as string, ...(args as unknown[]));
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    } catch {
      /* ignore */
    }
    try {
      const raw = await fsp.readFile(this.filePath, "utf-8");
      const data = JSON.parse(raw) as QueueData;
      this.items = (data.items ?? []).map((item) => {
        if (item.status === "processing") {
          item.status = "queued";
          item.retryCount = 0;
        }
        return item;
      });
    } catch {
      this.items = [];
    }
    this.loaded = true;
  }

  async save(): Promise<void> {
    const data: QueueData = { items: this.items };
    await fsp.writeFile(
      this.filePath,
      JSON.stringify(data, null, 2),
      "utf-8",
    );
  }

  async enqueue(sourcePath: string, fileName: string): Promise<string> {
    const id = `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item: QueueItem = {
      id,
      sourcePath,
      fileName,
      status: "queued",
      retryCount: 0,
      maxRetries: 3,
      progress: 0,
      stage: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.items.push(item);
    await this.save();
    return id;
  }

  async updateProgress(
    itemId: string,
    progress: number,
    stage: string,
  ): Promise<void> {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) return;
    item.progress = progress;
    item.stage = stage;
    item.updatedAt = Date.now();
    await this.save();
    this.emit("progress", {
      itemId,
      progress,
      stage,
      fileName: item.fileName,
    });
  }

  async updateStatus(
    itemId: string,
    status: QueueItemStatus,
    error?: string,
  ): Promise<void> {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) return;
    item.status = status;
    item.error = error;
    item.updatedAt = Date.now();
    await this.save();
    this.emit("status", {
      itemId,
      status,
      fileName: item.fileName,
      error,
    });
  }

  async cancel(itemId: string): Promise<boolean> {
    const item = this.items.find((i) => i.id === itemId);
    if (!item || item.status === "completed") return false;
    item.status = "cancelled";
    item.updatedAt = Date.now();
    await this.save();
    this.emit("status", {
      itemId,
      status: "cancelled",
      fileName: item.fileName,
    });
    return true;
  }

  getItems(): QueueItem[] {
    return [...this.items];
  }

  getPending(): QueueItem[] {
    return this.items.filter((i) => i.status === "queued");
  }

  get(itemId: string): QueueItem | undefined {
    return this.items.find((i) => i.id === itemId);
  }

  async clearCompleted(): Promise<void> {
    this.items = this.items.filter(
      (i) => i.status !== "completed" && i.status !== "cancelled",
    );
    await this.save();
  }
}
