# Clerk Authentication

## Architecture Overview

Clerk runs **only on the website** (`ScholarOS-Website`). The desktop app authenticates via a **custom OAuth 2.0 + PKCE** flow against the website, which uses Clerk internally.

```
[Desktop App (Electron)]                [Website (Next.js + Clerk)]
         |                                        |
   [OAuth 2.0 + PKCE]                      [Clerk Auth]
         |                                        |
   1. Build authorize URL               2. Redirect to /sign-in
      with PKCE challenge                  if not authenticated
         |                                        |
   3. Open in system                    4. Clerk signs user in
      browser (shares                      (session cookie in browser)
      browser session)                          |
         |                                        |
   5. User authorizes                    6. Read user.publicMetadata
      (already signed in)                  .subscription
         |                                        |
   7. Receive auth_code                  8. Sign JWT (auth_code)
      (signed JWT)                         with userId, email,
      via redirect                          subscription data
         |                                        |
   9. POST to /api/oauth/token           10. Verify auth_code JWT,
      with code + code_verifier              PKCE challenge match
         |                                        |
  11. Receive access_token +             12. Issue signed JWT tokens
      refresh_token                        (access_token TTL: 1h,
      (self-signed JWTs)                    refresh_token TTL: 30d)
         |                                        |
  13. Call /v1/llm/* with                14. Verify access_token JWT,
      Bearer access_token                   fetch user from Clerk,
      or /v1/me                            check subscription status
         |                                        |
  15. If subscribed: proxy               16. Forward to OpenRouter
      to OpenRouter                        API with deepseek-v4-flash
         |                                        |
  17. Receive LLM response               18. Return stream to desktop
```

## Key Endpoints (Website)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/oauth/authorize` | GET | Authorization endpoint, redirects to Clerk sign-in if unauthenticated |
| `/api/oauth/token` | POST | Token exchange (auth_code → access_token + refresh_token) |
| `/v1/llm/*` | GET/POST | LLM proxy (proxies to OpenRouter, checks subscription) |
| `/v1/me` | GET | User info + subscription status |

All tokens are **self-signed HMAC-SHA256 JWTs** using `SCHOLAROS_AUTH_SECRET`.

### Auth Code JWT (`typ: "auth_code"`)
- Fields: `sub` (Clerk userId), `email`, `scope`, `client_id`, `subscription`, `redirect_uri`, `code_challenge`, `code_challenge_method`
- TTL: 10 minutes

### Access Token JWT (`typ: "access_token"`)
- Fields: `sub`, `email`, `scope`, `client_id`, `subscription`
- TTL: 1 hour

### Refresh Token JWT (`typ: "refresh_token"`)
- Fields: `sub`, `email`, `scope`, `client_id`, `subscription`
- TTL: 30 days (rotated on each refresh)

## Subscription Data

Stored on Clerk user `publicMetadata.subscription`:

```typescript
type SubscriptionMetadata = {
  status: string | null;   // "active" | "trialing" | "cancelled" | "expired"
  plan: string | null;     // "monthly" | variant name
  periodEnd: string | null; // ISO date string
};
```

**Written by:** Lemon Squeezy webhook (`/api/webhooks/lemon-squeezy`) via `clerkClient.users.updateUserMetadata()`

**Checked by:** `/v1/llm/*` proxy — if status is `"active"` or `"trialing"`, request is proxied to OpenRouter; otherwise returns 402.

**Effective behavior:** Subscribed users get unlimited usage (backend sets `sanctionedCredits: 999999`).

## LLM / OpenRouter

The website proxies LLM requests through OpenRouter:

| Property | Value |
|----------|-------|
| OpenRouter Base URL | `https://openrouter.ai/api/v1` |
| Default model | `deepseek/deepseek-v4-flash:free` |
| Allowed model | Only `deepseek/deepseek-v4-flash:free` (other models rejected) |

The desktop app's gateway provider points at `{API_URL}/v1/llm` with the OAuth Bearer token:

```typescript
// packages/core/src/models/gateway.ts
createOpenRouter({
  baseURL: `${API_URL}/v1/llm`,
  apiKey: "managed-by-scholaros",
  fetch: authedFetch,  // injects Authorization: Bearer <access_token>
});
```

When signed in, the default model is `deepseek/deepseek-v4-flash:free` with provider `"scholaros"` (gateway).

## Desktop App Components

### Core (`packages/core/src/auth/`)

| File | Purpose |
|------|---------|
| `providers.ts` | OAuth provider configs — defines `"scholaros"` with static endpoints |
| `oauth-client.ts` | OAuth 2.0 + PKCE primitives (discovery, code exchange, token refresh) |
| `tokens.ts` | `getAccessToken()` — reads tokens for `"scholaros"`, auto-refreshes |
| `repo.ts` | `FSOAuthRepo` — filesystem token storage at `~/.rowboat/config/oauth.json` |
| `types.ts` | Zod schemas for OAuth tokens |

### Core (`packages/core/src/models/`)

| File | Purpose |
|------|---------|
| `models.ts` | `createProvider()` factory — `"scholaros"` → `getGatewayProvider()` |
| `defaults.ts` | `getDefaultModelAndProvider()` — signed-in returns `scholaros` / `deepseek/deepseek-v4-flash:free` |
| `gateway.ts` | `getGatewayProvider()` — OpenRouter pointed at `{API_URL}/v1/llm` with OAuth token |

### Core (other)

| File | Purpose |
|------|---------|
| `account/account.ts` | `isSignedIn()` — checks if `"scholaros"` tokens exist |
| `billing/billing.ts` | `getBillingInfo()` — fetches from `{API_URL}/v1/me` |
| `config/env.ts` | `API_URL` constant (defaults to `http://localhost:3000`) |

### Main process (`apps/main/src/`)

| File | Purpose |
|------|---------|
| `oauth-handler.ts` | OAuth flow orchestrator — builds URL, opens browser, handles callback, saves tokens |
| `auth-server.ts` | Local HTTP server on port 8080 for OAuth callback |
| `ipc.ts` | IPC handlers for `oauth:connect`, `oauth:disconnect`, `oauth:getState`, `account:getAccount` |

### Renderer (`apps/renderer/src/`)

| File | Purpose |
|------|---------|
| `components/settings/account-settings.tsx` | Login/logout UI, plan display |
| `components/sidebar-content.tsx` | Connection status indicator |
| `components/settings-dialog.tsx` | OAuth provider state, per-category model config |
| `components/chat-input-with-mentions.tsx` | Provider list for model selector |
| `components/onboarding-modal.tsx` | Auth flow during onboarding |
| `hooks/useRowboatAccount.ts` | Account info hook |
| `hooks/useVoiceMode.ts` | Voice auth (Rowboat → ScholarOS) |
| `hooks/useConnectors.ts` | Connector auth checks |
| `hooks/useAnalyticsIdentity.ts` | PostHog identity tracking |
| `App.tsx` | Boot-time voice/TTS availability |

## Rewire: Rowboat → ScholarOS (Completed 2026-05-27)

### Changes Made

| Area | Files | What |
|------|-------|------|
| Provider config | `core/src/auth/providers.ts` | Replaced Rowboat OIDC discovery (`mode: "issuer"`) with ScholarOS static endpoints pointing at `{API_URL}/api/oauth/authorize` + `{API_URL}/api/oauth/token` |
| Auth infra | `core/src/auth/tokens.ts` | Removed DCR client registration from refresh flow (unnecessary with static client ID). Uses `createStaticConfiguration()` directly |
| Shared types | `models.ts`, `rowboat-account.ts`, `ipc.ts` | Flavor enum `"rowboat"` → `"scholaros"`, type `RowboatApiConfig` → `ScholarOSApiConfig`, IPC channel `"account:getRowboat"` → `"account:getAccount"` |
| Core auth | `account.ts`, `tokens.ts` | All `"rowboat"` → `"scholaros"` |
| Core models | `defaults.ts`, `models.ts`, `gateway.ts` | `SIGNED_IN_DEFAULT_PROVIDER`, switch case, `"managed-by-rowboat"` label |
| Core config | `rowboat.ts` | `getRowboatConfig()` → `getScholarOSConfig()` |
| Main process | `ipc.ts`, `oauth-handler.ts` | Renamed IPC channel handler; removed Rowboat-specific `/v1/me` billing init call on connect |
| Renderer hooks | `useRowboatAccount.ts`, `useVoiceMode.ts`, `useConnectors.ts`, `useAnalyticsIdentity.ts`, `useBilling.ts` | All function names + imports + provider string refs |
| Renderer components | `account-settings.tsx`, `sidebar-content.tsx`, `settings-dialog.tsx`, `chat-input-with-mentions.tsx`, `onboarding-modal.tsx`, `connectors-popover.tsx`, `App.tsx` | All `"rowboat"` → `"scholaros"` |

### HTTPS Workaround

`openid-client` (v6) rejects `http://` URLs by default. Since the website runs on `http://localhost:3000` in development, three `oauth-client.ts` functions were rewritten to use raw `fetch` instead of openid-client's HTTPS-enforcing methods:

| Function | Replaces |
|----------|----------|
| `buildAuthorizationUrl()` | `client.buildAuthorizationUrl()` — manual `URL` + `URLSearchParams` construction |
| `exchangeCodeForTokens()` | `client.authorizationCodeGrant()` — raw `fetch` POST with form body |
| `refreshTokens()` | `client.refreshTokenGrant()` — raw `fetch` POST with form body |

Google and Fireflies providers still use openid-client's methods (their issuer URLs are HTTPS).

### Remaining Rowboat References (Left Alone)

These are example data / prompt content — not auth logic:

- `core/src/application/lib/builtin-tools.ts` — Composio tool example string
- `core/src/application/assistant/skills/composio-integration/skill.ts` — AI prompt examples
- `core/src/agents/runtime.ts` — `"rowboatx"` agent name (internal agent type)
- `core/src/mcp/mcp.ts` — `"rowboatx"` agent name
- `core/src/application/assistant/agent.ts` — `"rowboatx"` agent name
- `core/src/config/config.ts` — `~/.rowboat/` config directory (renaming breaks existing user configs)
- Various example data in prompts, temp dirs, sample content

### Verification

```bash
npm run deps   # shared → core → preload all compile
npm run lint   # 10 pre-existing errors, zero new errors from changes
```
