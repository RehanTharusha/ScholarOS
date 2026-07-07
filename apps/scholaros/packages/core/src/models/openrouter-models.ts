import fs from "node:fs/promises";
import path from "node:path";
import z from "zod";
import { GlobalConfigDir } from "../config/config.js";

const CACHE_TTL_MS = 60 * 60 * 1000;

function getCachePath(): string {
  return path.join(GlobalConfigDir, "openrouter-models.json");
}

const OpenRouterModel = z.object({
  id: z.string(),
  name: z.string().optional(),
});

const OpenRouterResponse = z.object({
  data: z.array(OpenRouterModel),
});

export type OpenRouterModelSummary = {
  id: string;
  name?: string;
};

type CacheFile = {
  fetchedAt: string;
  data: unknown;
};

async function readCache(): Promise<CacheFile | null> {
  try {
    const raw = await fs.readFile(getCachePath(), "utf8");
    return JSON.parse(raw) as CacheFile;
  } catch {
    return null;
  }
}

async function writeCache(data: unknown): Promise<void> {
  const payload: CacheFile = {
    fetchedAt: new Date().toISOString(),
    data,
  };
  await fs.writeFile(getCachePath(), JSON.stringify(payload, null, 2));
}

async function fetchOpenRouterModels(): Promise<z.infer<typeof OpenRouterModel>[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { "User-Agent": "ScholarOS" },
  });
  if (!response.ok) {
    throw new Error(`OpenRouter API fetch failed: ${response.status}`);
  }
  const json = await response.json();
  const parsed = OpenRouterResponse.parse(json);
  return parsed.data;
}

function isCacheFresh(fetchedAt: string): boolean {
  const age = Date.now() - new Date(fetchedAt).getTime();
  return age < CACHE_TTL_MS;
}

async function getOpenRouterModels(): Promise<{
  models: OpenRouterModelSummary[];
  fetchedAt?: string;
}> {
  const cached = await readCache();
  if (cached?.fetchedAt && isCacheFresh(cached.fetchedAt)) {
    const parsed = OpenRouterResponse.safeParse({
      data: cached.data,
    });
    if (parsed.success) {
      return { models: parsed.data.data, fetchedAt: cached.fetchedAt };
    }
  }

  try {
    const fresh = await fetchOpenRouterModels();
    await writeCache(fresh);
    return { models: fresh, fetchedAt: new Date().toISOString() };
  } catch (error) {
    if (cached) {
      const parsed = OpenRouterResponse.safeParse({
        data: cached.data,
      });
      if (parsed.success) {
        return { models: parsed.data.data, fetchedAt: cached.fetchedAt };
      }
    }
    throw error;
  }
}

export async function listOpenRouterModels(): Promise<{ models: OpenRouterModelSummary[] }> {
  const { models } = await getOpenRouterModels();
  return { models };
}
