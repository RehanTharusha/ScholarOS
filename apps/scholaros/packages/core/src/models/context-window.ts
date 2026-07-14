const FALLBACK_CONTEXT_WINDOW = 128_000;

const MODEL_FAMILY_LIMITS: Record<string, number> = {
  "gpt-3.5": 16_384,
  "gpt-4": 8_192,
  "gpt-4-32k": 32_768,
  "gpt-4-turbo": 128_000,
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "o1": 200_000,
  "o1-mini": 128_000,
  "o3": 200_000,
  "o3-mini": 200_000,
  "claude-3-haiku": 200_000,
  "claude-3-sonnet": 200_000,
  "claude-3-opus": 200_000,
  "claude-3.5": 200_000,
  "claude-3.7": 200_000,
  "claude-4": 200_000,
  "claude-sonnet-4": 200_000,
  "claude-opus-4": 200_000,
  "claude-haiku-3": 200_000,
  "claude-fable": 200_000,
  "claude-mythos": 200_000,
  "gemini-1.5": 1_000_000,
  "gemini-1.5-pro": 2_000_000,
  "gemini-2.0": 1_000_000,
  "gemini-2.5": 1_000_000,
  "gemini-2.5-pro": 1_000_000,
  "deepseek": 128_000,
  "deepseek-v2": 128_000,
  "deepseek-v3": 128_000,
  "deepseek-v4": 128_000,
  "deepseek-r1": 128_000,
  "llama-2": 4_096,
  "llama-3": 8_192,
  "llama-3.1": 128_000,
  "llama-3.2": 128_000,
  "llama-3.3": 128_000,
  "llama-4": 1_000_000,
  "mistral": 32_768,
  "mistral-large": 128_000,
  "mixtral": 32_768,
  "qwen-2": 32_768,
  "qwen-2.5": 128_000,
  "qwen-3": 128_000,
  "command-r": 128_000,
};

function matchModelFamily(modelId: string): number | null {
  const lower = modelId.toLowerCase();
  for (const [family, limit] of Object.entries(MODEL_FAMILY_LIMITS)) {
    if (lower.includes(family)) return limit;
  }
  return null;
}

let devModelWindows: Map<string, number> | null = null;

async function ensureDevWindows(): Promise<Map<string, number>> {
  if (devModelWindows !== null) return devModelWindows;
  const windows = new Map<string, number>();
  try {
    const { getModelsDevData } = await import("./models-dev.js");
    const { data } = await getModelsDevData();
    for (const provider of Object.values(data)) {
      for (const [modelId, model] of Object.entries(provider.models)) {
        const m = model as Record<string, unknown>;
        const limit = m.limit as Record<string, unknown> | undefined;
        if (limit && typeof limit.context === "number") {
          const id = (m.id as string) ?? modelId;
          windows.set(id, limit.context);
        }
      }
    }
  } catch {
    // Non-critical — fallback to known families
  }
  devModelWindows = windows;
  return windows;
}

export async function loadDevModelContextWindows(): Promise<void> {
  await ensureDevWindows();
}

export function getContextWindow(modelId: string): number {
  if (!modelId) return FALLBACK_CONTEXT_WINDOW;
  if (devModelWindows && devModelWindows.has(modelId)) {
    return devModelWindows.get(modelId)!;
  }
  const matched = matchModelFamily(modelId);
  if (matched !== null) return matched;
  return FALLBACK_CONTEXT_WINDOW;
}

export { FALLBACK_CONTEXT_WINDOW };
