# Smoke-test plan

## Context
Tiny fixture plan used by cursor-agent-all-plan-parser tests.

## Goals
- Exercise heading + file + role extraction.

## Non-goals
- Anything real.

## Task list

### Task 1: Add CHANGELOG entry
role: doc-writer
- Create: `CHANGELOG.md`
- Modify: `docs/index.md`

Verification: `npm run lint`

### Task 2: Implement loader
role: backend-dev
- Create: `src/loader.ts`
- Modify: `src/index.ts`

### Task 3: Frontend tweak
- Modify: `src/ui/button.tsx`
