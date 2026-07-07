import { z } from "zod";
import { API_URL } from "../config/env.js";

/**
 * Discovery configuration - how to get OAuth endpoints
 */
const DiscoverySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("issuer"),
    issuer: z
      .url()
      .describe(
        "The issuer base url. To discover the endpoints, the client will fetch the .well-known/oauth-authorization-server from this url.",
      ),
  }),
  z.object({
    mode: z.literal("static"),
    authorizationEndpoint: z.url(),
    tokenEndpoint: z.url(),
    revocationEndpoint: z.url().optional(),
  }),
]);

/**
 * Client configuration - how to get client credentials
 */
const ClientSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("static"),
    clientId: z.string().min(1).optional(),
  }),
  z.object({
    mode: z.literal("dcr"),
    // If omitted, should be discovered from auth-server metadata as `registration_endpoint`
    registrationEndpoint: z.url().optional(),
  }),
]);

/**
 * Provider configuration schema
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ProviderConfigSchema = z.record(
  z.string(),
  z.object({
    discovery: DiscoverySchema,
    client: ClientSchema,
    scopes: z.array(z.string()).optional(),
  }),
);

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ProviderConfigEntry = ProviderConfig[string];

/**
 * All configured OAuth providers
 */
const providerConfigs: ProviderConfig = {
  scholaros: {
    discovery: {
      mode: "static",
      authorizationEndpoint: `${API_URL}/api/oauth/authorize`,
      tokenEndpoint: `${API_URL}/api/oauth/token`,
    },
    client: {
      mode: "static",
      clientId: process.env.SCHOLAROS_CLIENT_ID || "scholaros-desktop",
    },
    scopes: ["email", "profile", "offline_access"],
  },
  google: {
    discovery: {
      mode: "issuer",
      issuer: "https://accounts.google.com",
    },
    client: {
      mode: "static",
    },
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  },

};

/**
 * Get provider configuration by name
 */
export async function getProviderConfig(
  providerName: string,
): Promise<ProviderConfigEntry> {
  const config = providerConfigs[providerName];
  if (!config) {
    throw new Error(`Unknown OAuth provider: ${providerName}`);
  }
  return config;
}

/**
 * Get list of all configured OAuth providers
 */
export function getAvailableProviders(): string[] {
  return Object.keys(providerConfigs);
}
