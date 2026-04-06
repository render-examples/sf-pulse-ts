---
name: pg-mem-upstream-fix
description: Use when pg-mem disagrees with valid PostgreSQL behavior in this repo. Patch pg-mem with patch-package, keep application SQL unchanged, add a focused regression test, and update the upstreaming docs and patch notes.
---

# pg-mem upstream fix

PostgreSQL is authoritative. If a query, migration, or schema change is valid in
Postgres but fails in `pg-mem`, do not weaken repo SQL.

## Workflow

1. Reduce the failure to the smallest SQL reproduction you can.
2. Add or update a focused regression test, preferably in
   [server/pg-mem.test.ts](/Users/joeybaker/Code/sf-pulse/server/pg-mem.test.ts).
3. Patch the emulator stack in `node_modules/`, including `pg-mem` and any
   bundled parser dependency that is wrong for valid PostgreSQL.
4. Regenerate the patches with `npx patch-package pg-mem pgsql-ast-parser`.
5. Update [patches/README.md](/Users/joeybaker/Code/sf-pulse/patches/README.md).
6. Update [docs/pg-mem-upstreaming.md](/Users/joeybaker/Code/sf-pulse/docs/pg-mem-upstreaming.md).
7. Run the focused tests first, then the full test and typecheck passes.
8. If the patch is repo-worthy, queue one upstream issue and one narrow upstream
   PR for each distinct bug.

## Rules

- Do not rewrite application SQL only to satisfy `pg-mem`.
- Use `index.js.map` to map bundle edits back to upstream TypeScript files.
- Prefer one upstream issue and one upstream PR per distinct bug.
- Keep patch notes concrete: failure mode, root cause, bundle edit, upstream target.
- If a change only exists to satisfy `pg-mem`, remove the app-side workaround and
  patch `pg-mem` instead.

## Reference

Read [docs/pg-mem-upstreaming.md](/Users/joeybaker/Code/sf-pulse/docs/pg-mem-upstreaming.md) before changing an existing patch or adding a new one.
