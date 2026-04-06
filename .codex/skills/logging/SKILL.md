---
name: logging
description: Use when changing console logging in this repo. Prefer console.info for expected lifecycle output, console.warn for degraded but recoverable states, console.error for failures, and reserve console.log for temporary debugging.
---

# Logging

Use this skill when editing scripts, server startup code, background jobs, or other repo code that writes to the console.

## Rules

- `console.info` is the default for expected operational output: startup, progress, counts, and successful completions.
- `console.warn` is for degraded but recoverable states: disabled integrations, partial source failures, retries, or skipped work.
- `console.error` is for failures and invalid data paths that need operator attention.
- `console.log` is for temporary debugging only. Do not introduce it for normal lifecycle output.
- Keep prefixes stable, e.g. `[cron]`, `[migrate]`, `[seed-menus]`, so logs stay grep-friendly.
- Include enough context in failures to identify the failing source, job, or entity without re-running under a debugger.

## Workflow

1. Read the surrounding file and classify each log as info, warning, error, or debug.
2. Replace lifecycle `console.log` calls with `console.info`.
3. Upgrade any `console.log` failure paths to `console.error`.
4. Keep `console.warn` and `console.error` when they already match the behavior.
5. Before finishing, run `rg -n "console\\.(log|info|warn|error)"` to check that remaining `console.log` calls are intentional.

## Repo patterns

- Long-running jobs should log phase boundaries and result counts with `console.info`.
- Source-level failures inside fan-out work should prefer `console.warn` when the overall job can continue.
- Top-level script failures should use `console.error` and exit non-zero.
