/**
 * Simple LRU (Least Recently Used) Map with a max size.
 *
 * When the cache exceeds `maxSize`, the least recently used entry is evicted.
 * Used to bound memory usage of unbounded caches (e.g. editor drafts, file
 * metadata) without sacrificing hit rate for recently-accessed items.
 */
export class LRUMap<K, V> {
  private readonly maxSize: number;
  private readonly map = new Map<K, V>();

  constructor(maxSize: number) {
    if (maxSize <= 0) {
      throw new Error("LRUMap maxSize must be > 0");
    }
    this.maxSize = maxSize;
  }

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Re-insert to mark as most-recently-used.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V): this {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest entry (first key in insertion order).
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
    return this;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }
}
