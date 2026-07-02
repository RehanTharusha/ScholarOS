import * as client from 'openid-client';
import { OAuthTokens, ClientRegistrationResponse } from './types.js';

/**
 * Cached configurations per provider (issuer:clientId -> Configuration)
 */
const configCache = new Map<string, client.Configuration>();

/**
 * Helper to convert openid-client token response to our OAuthTokens type
 */
function toOAuthTokens(response: client.TokenEndpointResponse): OAuthTokens {
  const accessToken = response.access_token;
  const refreshToken = response.refresh_token ?? null;

  // Calculate expires_at from expires_in
  const expiresIn = response.expires_in ?? 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

  // Parse scopes from space-separated string
  let scopes: string[] | undefined;
  if (response.scope) {
    scopes = response.scope.split(' ').filter(s => s.length > 0);
  }

  return OAuthTokens.parse({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    token_type: 'Bearer',
    scopes,
  });
}

/**
 * Discover authorization server metadata and create configuration
 */
export async function discoverConfiguration(
  issuerUrl: string,
  clientId: string,
  clientSecret?: string
): Promise<client.Configuration> {
  const cacheKey = `${issuerUrl}:${clientId}:${clientSecret ? 'secret' : 'none'}`;

  const cached = configCache.get(cacheKey);
  if (cached) {
    console.log(`[OAuth] Using cached configuration for ${issuerUrl}`);
    return cached;
  }
  console.log(`[OAuth] Discovering authorization server metadata for ${issuerUrl}...`);
  const config = await client.discovery(
    new URL(issuerUrl),
    clientId,
    clientSecret ?? undefined,
    clientSecret ? client.ClientSecretPost(clientSecret) : client.None(),
    {
      execute: [client.allowInsecureRequests],
    }
  );

  configCache.set(cacheKey, config);
  console.log(`[OAuth] Discovery complete for ${issuerUrl}`);
  return config;
}

/**
 * Create configuration from static endpoints (no discovery)
 */
export function createStaticConfiguration(
  authorizationEndpoint: string,
  tokenEndpoint: string,
  clientId: string,
  revocationEndpoint?: string,
  clientSecret?: string
): client.Configuration {
  console.log(`[OAuth] Creating static configuration (no discovery)`);

  const issuer = new URL(authorizationEndpoint).origin;

  // Create Configuration with static metadata
  const serverMetadata: client.ServerMetadata = {
    issuer,
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: tokenEndpoint,
    revocation_endpoint: revocationEndpoint,
  };

  return new client.Configuration(
    serverMetadata,
    clientId,
    clientSecret ?? undefined,
    clientSecret ? client.ClientSecretPost(clientSecret) : client.None()
  );
}

/**
 * Register client via Dynamic Client Registration (RFC 7591)
 * Returns both the Configuration and the registration response (for persistence)
 */
export async function registerClient(
  issuerUrl: string,
  redirectUris: string[],
  scopes: string[],
  clientName: string = 'ScholarOS Desktop App'
): Promise<{ config: client.Configuration; registration: ClientRegistrationResponse }> {
  console.log(`[OAuth] Registering client via DCR at ${issuerUrl}...`);
  const config = await client.dynamicClientRegistration(
    new URL(issuerUrl),
    {
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none', // PKCE flow
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: clientName,
      scope: scopes.join(' '),
    },
    client.None(),
    {
      execute: [client.allowInsecureRequests],
    },
  );

  const metadata = config.clientMetadata();
  console.log(`[OAuth] DCR complete, client_id: ${metadata.client_id}`);

  // Extract registration response for persistence
  const registration = ClientRegistrationResponse.parse({
    client_id: metadata.client_id,
    client_secret: metadata.client_secret,
    client_id_issued_at: metadata.client_id_issued_at,
    client_secret_expires_at: metadata.client_secret_expires_at,
  });

  // Cache the configuration
  const cacheKey = `${issuerUrl}:${metadata.client_id}`;
  configCache.set(cacheKey, config);

  return { config, registration };
}

/**
 * Generate PKCE code verifier and challenge
 */
export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifier = client.randomPKCECodeVerifier();
  const challenge = await client.calculatePKCECodeChallenge(verifier);
  return { verifier, challenge };
}

/**
 * Generate random state for CSRF protection
 */
export function generateState(): string {
  return client.randomState();
}

/**
 * Build authorization URL with PKCE.
 * Uses manual URL construction to avoid openid-client's HTTPS-only restriction,
 * which rejects http:// localhost URLs during development.
 */
export function buildAuthorizationUrl(
  config: client.Configuration,
  params: Record<string, string>,
): URL {
  const metadata = config.serverMetadata();
  const endpoint = metadata.authorization_endpoint;
  if (!endpoint) {
    throw new Error("Authorization server metadata missing authorization_endpoint");
  }
  const url = new URL(endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge_method", "S256");
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url;
}

/**
 * Exchange authorization code for tokens
 * Uses raw fetch to avoid openid-client's HTTPS-only restriction.
 */
export async function exchangeCodeForTokens(
  config: client.Configuration,
  callbackUrl: URL,
  codeVerifier: string,
): Promise<OAuthTokens> {
  console.log(`[OAuth] Exchanging authorization code for tokens...`);

  const code = callbackUrl.searchParams.get("code");
  if (!code) {
    throw new Error("Authorization callback missing code parameter");
  }

  const metadata = config.serverMetadata();
  const tokenEndpoint = metadata.token_endpoint;
  if (!tokenEndpoint) {
    throw new Error("Server metadata missing token_endpoint");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl.origin + callbackUrl.pathname,
    code_verifier: codeVerifier,
    client_id: (config as unknown as Record<string, unknown>).clientId as string ?? "",
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  console.log(`[OAuth] Token exchange successful`);
  return toOAuthTokens(data);
}

/**
 * Refresh access token using refresh token
 * Uses raw fetch to avoid openid-client's HTTPS-only restriction.
 * Preserves existing scopes if not returned by server
 */
export async function refreshTokens(
  config: client.Configuration,
  refreshToken: string,
  existingScopes?: string[],
): Promise<OAuthTokens> {
  console.log(`[OAuth] Refreshing access token...`);

  const metadata = config.serverMetadata();
  const tokenEndpoint = metadata.token_endpoint;
  if (!tokenEndpoint) {
    throw new Error("Server metadata missing token_endpoint");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: (config as unknown as Record<string, unknown>).clientId as string ?? "",
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const tokens = toOAuthTokens(data);

  // Preserve existing scopes if server didn't return them
  if (!tokens.scopes && existingScopes) {
    tokens.scopes = existingScopes;
  }

  // Preserve existing refresh token if server didn't return it
  if (!tokens.refresh_token) {
    tokens.refresh_token = refreshToken;
  }

  console.log(`[OAuth] Token refresh successful`);
  return tokens;
}

const EXPIRY_MARGIN_SECONDS = 60;

/**
 * Check if tokens are expired. Treats tokens as expired EXPIRY_MARGIN_SECONDS
 * before the real expiry to absorb clock skew and in-flight request latency.
 */
export function isTokenExpired(tokens: OAuthTokens): boolean {
  const now = Math.floor(Date.now() / 1000);
  return tokens.expires_at <= now + EXPIRY_MARGIN_SECONDS;
}

/**
 * Clear configuration cache for a specific provider or all providers
 */
export function clearConfigCache(issuerUrl?: string, clientId?: string): void {
  if (issuerUrl && clientId) {
    configCache.delete(`${issuerUrl}:${clientId}`);
    console.log(`[OAuth] Cleared configuration cache for ${issuerUrl}`);
  } else {
    configCache.clear();
    console.log(`[OAuth] Cleared all configuration cache`);
  }
}

/**
 * Get cached configuration if available
 */
export function getCachedConfiguration(issuerUrl: string, clientId: string): client.Configuration | undefined {
  return configCache.get(`${issuerUrl}:${clientId}`);
}

// Re-export Configuration type for external use
export type { Configuration } from 'openid-client';

