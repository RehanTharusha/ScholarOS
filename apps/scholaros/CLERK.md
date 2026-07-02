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

## Audit: Current State

### What works (no changes needed)
- Full OAuth 2.0 + PKCE client infrastructure
- OAuth handler in main process (opens browser, handles callback, exchanges code)
- Local auth server on port 8080
- Token storage + auto-refresh
- Gateway provider → OpenRouter at `{API_URL}/v1/llm` with OAuth bearer
- Default model `deepseek/deepseek-v4-flash:free` for signed-in users
- Login/logout UI + plan display
- Billing info fetcher → `/v1/me`

### What needs to change (rewire from Rowboat → ScholarOS)

The desktop app was originally built for Rowboat's OAuth provider. The entire OAuth infrastructure is correct; it just needs to be pointed at the ScholarOS website instead of Rowboat.

#### Provider configuration (`packages/core/src/auth/providers.ts`)
- `"rowboat"` used OIDC discovery against Rowboat's issuer URL
- `"scholaros"` uses **static endpoints** (no OIDC `.well-known` on website):
  - Authorization: `{API_URL}/api/oauth/authorize`
  - Token: `{API_URL}/api/oauth/token`
  - Client ID: `scholaros-desktop` (matches website's `SCHOLAROS_CLIENT_ID`)

#### All `"rowboat"` string references
- `packages/core/src/auth/tokens.ts` — 5 hardcoded `"rowboat"` strings
- `packages/core/src/account/account.ts` — `isSignedIn()` checks `"rowboat"`
- `packages/core/src/models/defaults.ts` — `SIGNED_IN_DEFAULT_PROVIDER`
- `packages/shared/src/models.ts` — `LlmProvider` flavor enum
- `packages/core/src/models/models.ts` — `createProvider()` switch case
- `apps/main/src/oauth-handler.ts` — Rowboat-specific billing init
- `apps/renderer/src/` — ~40 references across hooks and components

#### IPC channel rename
- `"account:getRowboat"` → `"account:getAccount"`

## Plan: Rewire to ScholarOS

1. **Provider config** — Replace OIDC discovery `"rowboat"` with static `"scholaros"` provider in `providers.ts`
2. **Auth infra** — Update `tokens.ts`, `account.ts` from `"rowboat"` → `"scholaros"`
3. **Models** — Rename `"rowboat"` flavor to `"scholaros"` in shared types + core factory + defaults
4. **Main process** — Update `oauth-handler.ts` (remove Rowboat billing init), rename IPC channel
5. **Renderer hooks** — `useRowboatAccount.ts` → `useAccount.ts`, update all provider name refs
6. **Renderer components** — `account-settings.tsx`, `sidebar-content.tsx`, `settings-dialog.tsx`, `chat-input-with-mentions.tsx`, `onboarding-modal.tsx`, `App.tsx`
7. **Verify** — `npm run deps && npm run lint`
