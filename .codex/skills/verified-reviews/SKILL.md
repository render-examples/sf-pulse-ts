---
name: verified-reviews
description: Use when dispatching spec-compliance or code-quality reviewer subagents, before writing the reviewer prompt. Ensures reviewers run tests and typecheck instead of only reading code.
---

# Verified Reviews

Reviewer subagents MUST run the project's test suite and typecheck as part of every review. Reading code alone is insufficient — it misses runtime failures, type errors, and regressions.

## The Rule

Every reviewer subagent prompt MUST include these verification steps:

```
## Required Verification (Non-Negotiable)

Before forming your assessment, you MUST run:

1. `npm test` — full test suite must pass
2. `npm run typecheck` — no type errors

If either fails, report ❌ immediately with the failure output.
Do NOT approve code that you haven't verified passes tests and typecheck.
Do NOT skip these because "the implementer said tests pass."
```

## Why

Implementers report "all tests pass" but may have:
- Run only a subset of tests
- Made changes after their last test run
- Missed type errors (tests pass but types don't)
- Introduced regressions in files they didn't directly touch

## Red Flags

If you catch yourself thinking any of these, STOP:

| Thought | Reality |
|---------|---------|
| "The implementer already ran tests" | Trust but verify. Run them yourself. |
| "I can tell from reading the code" | You can't detect runtime regressions by reading. |
| "Running tests is the implementer's job" | Verification is the reviewer's job. |
| "The diff looks clean" | Clean diffs can still break things. |
