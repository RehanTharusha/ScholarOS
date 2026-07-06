// JSONValue type matching the AI SDK's SharedV2ProviderOptions constraints
type JSONValue = string | number | boolean | { [key: string]: JSONValue } | JSONValue[];

export type ProviderOptions = Record<string, Record<string, JSONValue>>;

/**
 * Build provider-specific cache control options for prompt caching.
 * Anthropic: cache_control type
 * OpenAI: auto-detected from prefix (no-op marker)
 * Google: cached content (separate API, no SDK marker here)
 * Others: no cache support
 */
export function getCacheControlProviderOptions(
  providerFlavor: string,
): ProviderOptions {
  switch (providerFlavor) {
    case "anthropic":
      return {
        anthropic: {
          cacheControl: { type: "ephemeral" },
        },
      };
    case "openai":
    case "openai-compatible":
    case "openrouter":
    case "aigateway":
    case "scholaros":
    case "opencode":
    case "opencode-zen":
    case "opencode-go":
      return {};
    default:
      return {};
  }
}

export function extractProviderFlavor(modelId: string, providerName: string): string {
  return providerName;
}
