import { ProviderV2 } from "@ai-sdk/provider";
import { createGateway, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOllama } from "ollama-ai-provider-v2";
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { LlmModelConfig, LlmProvider } from "@scholaros/shared/dist/models.js";
import z from "zod";
import { getGatewayProvider } from "./gateway.js";
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

export const Provider = LlmProvider;
export const ModelConfig = LlmModelConfig;

/**
 * Read the OpenCode API key from ~/.local/share/opencode/auth.json
 * Auth format: { "opencode-go": { "type": "api", "key": "sk-..." } }
 * Falls back to trying "opencode" key if the requested provider is not found.
 */
function readOpenCodeAuthKey(provider?: string): string | undefined {
    try {
        const authPath = path.join(homedir(), ".local", "share", "opencode", "auth.json");
        if (!fs.existsSync(authPath)) return undefined;
        const raw = fs.readFileSync(authPath, "utf-8");
        const auth = JSON.parse(raw);
        if (provider && auth[provider]?.key) return auth[provider].key;
        if (auth["opencode-go"]?.key) return auth["opencode-go"].key;
        if (auth["opencode"]?.key) return auth["opencode"].key;
        const entry = Object.values(auth)[0];
        if (entry && typeof entry === "object" && "key" in entry) {
            return entry.key as string;
        }
        return undefined;
    } catch {
        return undefined;
    }
}

const OPENCODE_ZEN_BASE = "https://opencode.ai/zen/v1";
const OPENCODE_GO_BASE = "https://opencode.ai/zen/go/v1";

type ProviderSummary = {
    id: string;
    name: string;
    models: Array<{
        id: string;
        name?: string;
        release_date?: string;
    }>;
};

export async function listOpenCodeModels(
    flavor: "opencode-zen" | "opencode-go",
    apiKey?: string,
): Promise<{ providers: ProviderSummary[] }> {
    const baseURL = flavor === "opencode-zen" ? OPENCODE_ZEN_BASE : OPENCODE_GO_BASE;
    const modelsURL = baseURL.replace(/\/v1\/?$/, "") + "/v1/models";
    const key = apiKey || readOpenCodeAuthKey(flavor === "opencode-zen" ? "opencode" : "opencode-go");
    try {
        const headers: Record<string, string> = {
            "User-Agent": "ScholarOS",
        };
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const response = await fetch(modelsURL, { headers });
        if (!response.ok) return { providers: [] };
        const body = await response.json();
        const models: Array<{ id: string; name?: string }> =
            body.data || body.models || body || [];
        return {
            providers: [{
                id: flavor,
                name: flavor === "opencode-zen" ? "OpenCode Zen" : "OpenCode Go",
                models: models.map((m: { id: string; name?: string; object?: string }) => ({
                    id: m.id || m.object || "",
                    name: m.name || m.id,
                })).filter((m: { id: string }) => m.id),
            }],
        };
    } catch {
        return { providers: [] };
    }
}

export function createProvider(config: z.infer<typeof Provider>): ProviderV2 {
    const { apiKey, baseURL, headers } = config;
    switch (config.flavor) {
        case "openai":
            return createOpenAI({
                apiKey,
                baseURL,
                headers,
            });
        case "aigateway":
            return createGateway({
                apiKey,
                baseURL,
                headers,
            });
        case "anthropic":
            return createAnthropic({
                apiKey,
                baseURL,
                headers,
            });
        case "google":
            return createGoogleGenerativeAI({
                apiKey,
                baseURL,
                headers,
            });
        case "ollama": {
            let ollamaURL = baseURL;
            if (ollamaURL && !ollamaURL.replace(/\/+$/, '').endsWith('/api')) {
                ollamaURL = ollamaURL.replace(/\/+$/, '') + '/api';
            }
            return createOllama({
                baseURL: ollamaURL,
                headers,
            });
        }
        case "openai-compatible":
            return createOpenAICompatible({
                name: "openai-compatible",
                apiKey,
                baseURL: baseURL || "",
                headers,
            });
        case "openrouter":
            return createOpenRouter({
                apiKey,
                baseURL,
                headers,
            }) as unknown as ProviderV2;
        case "scholaros":
            return getGatewayProvider();
        case "opencode":
        case "opencode-zen": {
            const zenKey = apiKey || readOpenCodeAuthKey("opencode");
            return createOpenAICompatible({
                name: "opencode-zen",
                apiKey: zenKey,
                baseURL: baseURL || OPENCODE_ZEN_BASE,
                headers,
            });
        }
        case "opencode-go": {
            const goKey = apiKey || readOpenCodeAuthKey("opencode-go");
            return createOpenAICompatible({
                name: "opencode-go",
                apiKey: goKey,
                baseURL: baseURL || OPENCODE_GO_BASE,
                headers,
            });
        }
        default:
            throw new Error(`Unsupported provider flavor: ${config.flavor}`);
    }
}

export async function testModelConnection(
    providerConfig: z.infer<typeof Provider>,
    model: string,
    timeoutMs?: number,
): Promise<{ success: boolean; error?: string }> {
    const isLocal = providerConfig.flavor === "ollama" || providerConfig.flavor === "openai-compatible";
    const effectiveTimeout = timeoutMs ?? (isLocal ? 60000 : 30000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeout);
    try {
        const provider = createProvider(providerConfig);
        const languageModel = provider.languageModel(model);
        await generateText({
            model: languageModel,
            prompt: "ping",
            abortSignal: controller.signal,
        });
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Connection test failed";
        return { success: false, error: message };
    } finally {
        clearTimeout(timeout);
    }
}
