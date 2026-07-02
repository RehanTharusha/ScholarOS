import * as fs from 'fs';
import * as path from 'path';

/**
 * OpenCode model names available for use
 */
export const OPENCODE_MODEL_NAMES = [
  'opencode/big-pickle',
  'opencode/deepseek-v4-flash-free',
  'opencode/mimo-v2.5-free',
  'opencode/nemotron-3-ultra-free',
  'opencode-go/deepseek-v4-flash',
  'opencode-go/deepseek-v4-pro',
  'opencode-go/glm-5',
  'opencode-go/glm-5.1',
  'opencode-go/kimi-k2.5',
  'opencode-go/kimi-k2.6',
  'opencode-go/mimo-v2.5',
  'opencode-go/mimo-v2.5-pro',
  'opencode-go/minimax-m2.5',
  'opencode-go/minimax-m2.7',
  'opencode-go/minimax-m3',
  'opencode-go/qwen3.6-plus',
  'opencode-go/qwen3.7-max',
  'opencode-go/qwen3.7-plus',
] as const;

export type OpenCodeModelName = (typeof OPENCODE_MODEL_NAMES)[number];

/**
 * Structure of OpenCode auth.json
 */
interface OpenCodeAuthConfig {
  [provider: string]: {
    type: string;
    key: string;
    [key: string]: unknown;
  };
}

/**
 * Get the home directory in a cross-platform way
 */
function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '~';
}

/**
 * Get the path to OpenCode's auth.json file
 * Location: ~/.local/share/opencode/auth.json
 */
function getOpenCodeAuthPath(): string {
  const home = getHomeDir();
  return path.join(home, '.local', 'share', 'opencode', 'auth.json');
}

/**
 * Read OpenCode's auth.json and extract the API key for a provider
 * @param provider - The provider name (e.g., 'opencode-go', 'opencode')
 * @returns The API key string if found, undefined otherwise
 */
export function getOpenCodeApiKey(provider: string = 'opencode-go'): string | undefined {
  try {
    const authPath = getOpenCodeAuthPath();

    // Check if file exists
    if (!fs.existsSync(authPath)) {
      console.warn(`[OpenCode] Auth file not found at: ${authPath}`);
      return undefined;
    }

    // Read and parse the file
    const content = fs.readFileSync(authPath, 'utf8');
    const config: OpenCodeAuthConfig = JSON.parse(content);

    // Get the provider's credentials
    const providerConfig = config[provider];
    if (!providerConfig || !providerConfig.key) {
      console.warn(`[OpenCode] No API key found for provider: ${provider}`);
      return undefined;
    }

    return providerConfig.key;
  } catch (error) {
    // Handle any errors gracefully
    if (error instanceof SyntaxError) {
      console.error(`[OpenCode] Failed to parse auth.json: ${error.message}`);
    } else if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`[OpenCode] Auth file not found: ${getOpenCodeAuthPath()}`);
    } else {
      console.error(`[OpenCode] Error reading credentials:`, error);
    }
    return undefined;
  }
}

/**
 * Check if OpenCode credentials are available for a provider
 * @param provider - The provider name to check
 * @returns True if credentials exist for the provider
 */
export function hasOpenCodeCredentials(provider: string = 'opencode-go'): boolean {
  return getOpenCodeApiKey(provider) !== undefined;
}

/**
 * Get all available provider names from OpenCode auth.json
 * @returns Array of provider names that have credentials configured
 */
export function getOpenCodeProviders(): string[] {
  try {
    const authPath = getOpenCodeAuthPath();

    if (!fs.existsSync(authPath)) {
      return [];
    }

    const content = fs.readFileSync(authPath, 'utf8');
    const config: OpenCodeAuthConfig = JSON.parse(content);

    return Object.keys(config).filter(
      (provider) => config[provider] && typeof config[provider].key === 'string',
    );
  } catch {
    return [];
  }
}
