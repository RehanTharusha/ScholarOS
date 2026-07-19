# Plan 08: Testing Strategy

## Problem

The codebase has **zero test files**. Not one `.test.ts`, `.spec.ts`, or test directory exists across any package. The Playwright infrastructure is documented in CLAUDE.md (CDP-based Electron testing) but no actual tests use it.

This means:
1. **No safety net for refactoring** — The plans in this directory (01-10) involve major architectural changes. Without tests, every change is a leap of faith.
2. **No regression detection** — Features that work today may break tomorrow without anyone noticing.
3. **No documentation of expected behavior** — Tests serve as executable documentation. Their absence means the only way to understand what something should do is to read the implementation.

## Desired State

A focused, practical test suite:

1. **Unit tests** for core business logic (Zod schemas, IPC validation, utility functions)
2. **Integration tests** for the most critical user flows (create note, send chat message, auto-save)
3. **Component tests** for key UI components (after they're extracted from App.tsx)

Not in scope: 100% coverage, visual regression tests, performance tests.

## Implementation

### Step 1: Choose tools and set up infrastructure

**Unit tests:** Vitest (already Vite-based, minimal config)

```bash
cd apps/renderer && pnpm add -D vitest @testing-library/react @testing-library/jest-dom
```

Update `apps/renderer/vite.config.ts` to include Vitest config.

**E2E tests:** Playwright via CDP (infrastructure already documented). Install:

```bash
cd apps/scholaros && pnpm add -D playwright @playwright/test
```

Create `apps/scholaros/apps/renderer/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Step 2: Write unit tests for shared schemas (highest ROI)

File: `apps/scholaros/packages/shared/src/__tests__/ipc.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { ipc } from '../ipc';

// Test that every IPC channel has valid schemas
const channels = Object.keys(ipc) as Array<keyof typeof ipc>;

describe('IPC channel schemas', () => {
  it.each(channels)('%s has valid request schema', (channel) => {
    const schema = ipc[channel]?.req;
    expect(schema).toBeDefined();
    // Schema should parse successfully with valid input
    if (channel === 'workspace:readFile') {
      expect(schema.safeParse({ path: 'test.md' }).success).toBe(true);
      expect(schema.safeParse({ path: '' }).success).toBe(false);
    }
  });
});
```

Priority order for unit tests:
1. **IPC channel schemas** (`shared/src/ipc.ts`) — ensures API contract is valid
2. **Frontmatter parser** (`renderer/src/lib/frontmatter.ts`) — complex logic, easy to break
3. **Wiki-link parsing** (`renderer/src/lib/wiki-links.ts`) — edge cases with path normalization
4. **Chat conversation helpers** (`renderer/src/lib/chat-conversation.ts`) — grouping, filtering
5. **Workspace operations** (`core/src/workspace/workspace.ts`) — path safety, file operations
6. **Runs repository** (`core/src/runs/repo.ts`) — NDJSON log parsing

### Step 3: Write one critical-path E2E test

File: `apps/scholaros/e2e/note-creation-and-autosave.spec.ts`

```typescript
import { chromium } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Uses CDP connection to Electron as documented in CLAUDE.md

describe('Note creation and auto-save', () => {
  let browser, page;

  beforeAll(async () => {
    // Connect to running Electron app via CDP
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    page = context.pages().find(p => p.url().includes('localhost:5173'));
    expect(page).toBeDefined();
  });

  it('creates a new note and verifies auto-save', async () => {
    // Click "New Note" in sidebar
    await page.click('[data-action="new-note"]');

    // Type content in the editor (find by .tiptap-editor selector)
    const editor = page.locator('.tiptap-editor');
    await editor.fill('# My Test Note\n\nThis is auto-saved content.');

    // Wait for "Saved" indicator
    await expect(page.locator('text=Saved')).toBeVisible({ timeout: 5000 });

    // Verify file exists via IPC (evaluate in Electron context)
    const files = await page.evaluate(async () => {
      return await window.ipc.invoke('workspace:readdir', { path: '' });
    });
    expect(files.some(f => f.name.includes('My Test Note'))).toBe(true);
  });

  afterAll(async () => {
    await browser.close();
  });
});
```

### Step 4: Write integration test for chat submission

File: `apps/scholaros/e2e/chat-submission.spec.ts`

Test:
1. Type a message in the chat input
2. Click submit
3. Verify the user message appears in the conversation
4. Verify the "Thinking..." indicator appears
5. Verify an assistant response eventually appears
6. Verify the run appears in run history

### Step 5: Add CI configuration

Create `.github/workflows/test.yml`:

```yaml
name: Tests
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd apps/scholaros && npm ci
      - run: cd apps/scholaros && npm run deps
      - run: cd apps/renderer && npx vitest run

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd apps/scholaros && npm ci
      - run: cd apps/scholaros && npm run deps
      - run: |
          # Start Vite + Electron with remote debugging
          npx concurrently -k "npm run renderer" "npm run main"
          # Wait for app to be ready
          npx wait-on http://localhost:5173 && npx wait-on http://127.0.0.1:9222
      - run: cd apps/renderer && npx vitest run --config vitest.e2e.config.ts
```

(Note: GitHub Actions won't have a display. This is a template — actual E2E CI requires macOS with a virtual display or headless Electron.)

### Step 6: Add a test for the view state reducer (after plan 03)

Once the navigation reducer exists, test it in isolation:

```typescript
describe('navigationReducer', () => {
  it('navigates to file view', () => {
    const state = createInitialLayoutState();
    const next = navigationReducer(state, {
      type: 'NAVIGATE_TO',
      view: { type: 'file', path: 'test.md' },
    });
    expect(next.mainView).toEqual({ type: 'file', path: 'test.md' });
    expect(next.backStack).toHaveLength(0);
  });

  it('pushes current view to back stack on navigation', () => {
    const state = createInitialLayoutState();
    const afterFirst = navigationReducer(state, {
      type: 'NAVIGATE_TO',
      view: { type: 'graph' },
    });
    expect(afterFirst.backStack).toHaveLength(1);
    expect(afterFirst.backStack[0]).toEqual({ type: 'chat', runId: null });
  });
});
```

## Test Priority Matrix

| Test | Effort | Value | When |
|------|--------|-------|------|
| IPC schema unit tests | 2 hours | High | Now |
| Frontmatter parser tests | 1 hour | High | Now |
| Chat conversation helpers | 2 hours | High | Now |
| Note creation E2E | 4 hours | Very high | Before any refactoring |
| Navigation reducer unit tests | 2 hours | Very high | After plan 03 |
| Chat submission E2E | 6 hours | High | After app architecture changes |
| Workspace path safety tests | 1 hour | Medium | Now |
| Wiki-link edge case tests | 2 hours | Medium | Now |

## Verification

1. `npx vitest run` passes with at least 10 tests
2. E2E test creates a note and verifies auto-save
3. E2E test submits a chat message
4. IPC schema tests cover 10+ channels
5. Unit tests for chat-conversation.ts cover grouping logic

## Dependencies

- Depends on: nothing (can start immediately)
- Unlocks: All other plans (without tests, large refactors are risky)
