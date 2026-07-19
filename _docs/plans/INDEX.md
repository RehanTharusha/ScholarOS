# ScholarOS Improvement Plans

This directory contains detailed, actionable plans for improving ScholarOS. Each plan focuses on a specific area and includes concrete file paths, line references, and implementation order.

## Priority 1: Performance

| Plan | Problem | Effort |
|------|---------|--------|
| [01-Performance.md](01-Performance.md) | No systematic performance strategy. Unnecessary re-renders, blocking main thread, heavy bundles, no memoization discipline. | 1-2 weeks |

## Priority 2: Architecture

| Plan | Problem | Effort |
|------|---------|--------|
| [02-Break-Up-App-Tsx.md](02-Break-Up-App-Tsx.md) | App.tsx is 6,973 lines with 500+ state variables. Every feature's state, handlers, and rendering live in one closure. | 3-6 weeks |
| [03-View-Switching.md](03-View-Switching.md) | View state is 10+ mutually-exclusive booleans. Navigation functions must toggle flags in the right combination manually. | 1 week |
| [04-State-Management-Scope.md](04-State-Management-Scope.md) | 60+ props drilled through ChatSidebar. No clear boundary between local, shared, and global state. | 1-2 weeks |

## Priority 3: Code Quality

| Plan | Problem | Effort |
|------|---------|--------|
| [05-Duplicate-Rendering-Logic.md](05-Duplicate-Rendering-Logic.md) | Conversation rendering is duplicated verbatim in App.tsx and chat-sidebar.tsx (lines ~5444 and ~459). | 2-3 days |
| [06-Loading-State-Consistency.md](06-Loading-State-Consistency.md) | 4 different loading patterns used across the app (shimmer, animate-pulse, ViewFallback, nothing). | 3-5 days |
| [07-Empty-States.md](07-Empty-States.md) | Some views lack empty states per the design doc requirement. | 3-5 days |

## Priority 4: Testing & Safety

| Plan | Problem | Effort |
|------|---------|--------|
| [08-Testing-Strategy.md](08-Testing-Strategy.md) | Zero test files in the entire codebase. No safety net for refactoring. | Ongoing |

## Priority 5: Polish

| Plan | Problem | Effort |
|------|---------|--------|
| [09-Type-Safety-Fixes.md](09-Type-Safety-Fixes.md) | Multiple `as any` casts, console.log in production, magic strings, naming inconsistencies. | 2-3 days |
| [10-Paper-Theme-Consistency.md](10-Paper-Theme-Consistency.md) | Paper theme is partially applied. Some components use default shadcn instead of warm/ink-blue tokens. | 1 week |

## How to Read Each Plan

Every plan follows the same structure:

1. **Problem** — what's wrong, with exact file:line references
2. **Desired state** — what it should look like when done
3. **Implementation steps** — ordered, with specific code changes
4. **Verification** — how to confirm it worked
5. **Dependencies** — what other plans this blocks or depends on
