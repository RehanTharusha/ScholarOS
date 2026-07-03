/** Adapted from nashsu/llm_wiki (GPL v3) — ingest-cache.rs */

import fsp from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { getScholarOSPath } from "../config/config.js";

interface IngestCacheData {
  [sourcePath: string]: string;
}

export class IngestCache {
  private hashes: IngestCacheData = {};
  private loaded = false;
  private filePath: string;

  constructor() {
    this.filePath = path.join(
      getScholarOSPath(".knowledge-graph"),
      "ingest-cache.json",
    );
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
      this.hashes = JSON.parse(raw);
    } catch {
      this.hashes = {};
    }
    this.loaded = true;
  }

  async save(): Promise<void> {
    await fsp.writeFile(
      this.filePath,
      JSON.stringify(this.hashes, null, 2),
      "utf-8",
    );
  }

  async isUnchanged(sourcePath: string): Promise<boolean> {
    const currentHash = await this.hashFile(sourcePath);
    const cached = this.hashes[sourcePath];
    if (cached && cached === currentHash) return true;
    this.hashes[sourcePath] = currentHash;
    await this.save();
    return false;
  }

  async markChanged(sourcePath: string): Promise<void> {
    this.hashes[sourcePath] = await this.hashFile(sourcePath);
    await this.save();
  }

  invalidate(sourcePath: string): void {
    delete this.hashes[sourcePath];
  }

  private async hashFile(sourcePath: string): Promise<string> {
    const content = await fsp.readFile(sourcePath);
    return createHash("sha256").update(content).digest("hex");
  }
}
