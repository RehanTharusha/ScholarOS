import fsp from "fs/promises";
import path from "path";
import { getScholarOSPath } from "../config/config.js";
import {
  type ReviewItem,
  reviewIdFor,
  normalizeReviewItems,
  mergeReviewItems,
} from "./review-item.js";

interface ReviewStoreData {
  items: ReviewItem[]
}

export class ReviewStore {
  private items: ReviewItem[] = []
  private loaded = false
  private filePath: string

  constructor() {
    this.filePath = path.join(getScholarOSPath(".knowledge-graph"), "review-store.json")
  }

  async load(): Promise<void> {
    if (this.loaded) return
    try {
      await fsp.mkdir(path.dirname(this.filePath), { recursive: true })
    } catch {
      // ignore
    }
    try {
      const raw = await fsp.readFile(this.filePath, "utf-8")
      const data = JSON.parse(raw) as ReviewStoreData
      this.items = normalizeReviewItems(data.items ?? [])
    } catch {
      this.items = []
    }
    this.loaded = true
  }

  async save(): Promise<void> {
    const data: ReviewStoreData = { items: this.items }
    await fsp.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8")
  }

  getItems(type?: ReviewItem["type"]): ReviewItem[] {
    const items = type ? this.items.filter((i) => i.type === type) : this.items
    return items
      .filter((i) => !i.resolved)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  getAllItems(): ReviewItem[] {
    return [...this.items]
  }

  addItem(item: Omit<ReviewItem, "id" | "resolved" | "createdAt">): void {
    const id = reviewIdFor(item)
    const existing = this.items.find((i) => i.id === id)
    if (existing) {
      if (existing.resolved) return
      Object.assign(existing, mergeReviewItems(
        existing,
        { ...item, id, resolved: false, createdAt: Date.now() },
      ))
    } else {
      this.items.push({ ...item, id, resolved: false, createdAt: Date.now() })
    }
    this.save()
  }

  addItems(items: Omit<ReviewItem, "id" | "resolved" | "createdAt">[]): void {
    const byId = new Map<string, number>()
    this.items.forEach((it, idx) => byId.set(it.id, idx))

    for (const incoming of items) {
      const id = reviewIdFor(incoming)
      const existingIdx = byId.get(id)

      if (existingIdx !== undefined) {
        if (this.items[existingIdx].resolved) continue
        const old = this.items[existingIdx]
        this.items[existingIdx] = {
          ...old,
          description: incoming.description || old.description,
          sourcePath: incoming.sourcePath ?? old.sourcePath,
          affectedPages: [
            ...new Set([...(old.affectedPages ?? []), ...(incoming.affectedPages ?? [])]),
          ],
          searchQueries: [
            ...new Set([...(old.searchQueries ?? []), ...(incoming.searchQueries ?? [])]),
          ],
        }
      } else {
        const entry: ReviewItem = { ...incoming, id, resolved: false, createdAt: Date.now() }
        this.items.push(entry)
        byId.set(id, this.items.length - 1)
      }
    }

    this.save()
  }

  resolveItem(id: string, action: string): void {
    const item = this.items.find((i) => i.id === id)
    if (!item) return
    item.resolved = true
    item.resolvedAction = action
    this.save()
  }

  dismissItem(id: string): void {
    this.items = this.items.filter((i) => i.id !== id)
    this.save()
  }

  clearResolved(): void {
    this.items = this.items.filter((i) => !i.resolved)
    this.save()
  }
}
