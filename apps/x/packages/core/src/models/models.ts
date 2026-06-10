import { ProviderV2 } from "@ai-sdk/provider";
import { createGateway, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOllama } from "ollama-ai-provider-v2";
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { LlmModelConfig, LlmProvider } from "@x/shared/dist/models.js";
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
 * Falls back to trying "opencode" key if "opencode-go" is not found.
 */
function readOpenCodeAuthKey(): string | undefined {
    try {
        const authPath = path.join(homedir(), ".local", "share", "opencode", "auth.json");
        if (!fs.existsSync(authPath)) return undefined;
        const raw = fs.readFileSync(authPath, "utf-8");
        const auth = JSON.parse(raw);
        // Try opencode-go first, then opencode, then any key found
        const entry = auth["opencode-go"] || auth["opencode"] || Object.values(auth)[0];
        if (entry && typeof entry === "object" && "key" in entry) {
            return entry.key as string;
        }
        return undefined;
    } catch {
        return undefined;
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
            // ollama-ai-provider-v2 expects baseURL to include /api
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
        case "opencode": {
            const openCodeApiKey = apiKey || readOpenCodeAuthKey();
            return createOpenAICompatible({
                name: "opencode",
                apiKey: openCodeApiKey,
                baseURL: baseURL || "https://opencode.ai/zen",
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
