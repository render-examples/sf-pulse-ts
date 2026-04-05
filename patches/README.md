# patches/

Patches applied to `node_modules/` via [patch-package](https://github.com/ds300/patch-package).
Re-applied automatically on `npm install` via the `postinstall` script.

---

## pg-mem+3.0.14.patch

**Package:** `pg-mem@3.0.14`
**File patched:** `index.js` (bundled build — no separate source files in the npm package)

### Bug

`CREATE TABLE IF NOT EXISTS` raises a false-positive "Not supported" error on
the second (no-op) invocation when the AST coverage checker is enabled (the
default).

Root cause: `ExecuteCreateTable` processes each column definition by spreading
`f` into `nf` and explicitly ignoring `f.collate`, but never calls
`ignore(f.constraints)`. The spread reads the top-level `constraints` getter
(marking it as used), but the nested getters inside each constraint object are
never accessed. The `watchUse` tracker therefore reports them as "unread AST
nodes" and throws. This fires on the first call too, but on the first call
`declareTable` is invoked, which reads the constraints itself — clearing them
before `checkAstCoverage` runs. On the no-op path (`IF NOT EXISTS` + table
already exists) `declareTable` is skipped, so the constraints remain unread
when `checkAstCoverage` fires.

### Fix

Add `ignore(f.constraints)` immediately after `ignore(f.collate)` in the
`ExecuteCreateTable` constructor loop. Constraints are passed through to
`declareTable` via `toDeclare.fields` and processed there — they don't need
individual inspection in the constructor.

### Upstream

- Upstream repo: https://github.com/oguimbal/pg-mem
- File to patch in source: `src/execution/create-table.ts`, equivalent lines
  in the `ExecuteCreateTable` constructor, column `'column'` case
- Status: not yet reported — open an issue or PR referencing this file
