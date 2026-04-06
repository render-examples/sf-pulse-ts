---
name: db-migration-idempotence
description: Use when adding or changing SQL migrations in this repo. Enforce idempotent PostgreSQL migrations, add focused migrate() regressions, and keep valid SQL unchanged even when pg-mem disagrees.
---

# DB migration idempotence

Use this skill whenever work touches [migrations](/Users/joeybaker/Code/sf-pulse/migrations), [server/migrate.ts](/Users/joeybaker/Code/sf-pulse/server/migrate.ts), or migration tests.

## Repo facts

- Migrations are plain SQL files in `/migrations`, sorted by filename.
- [server/migrate.ts](/Users/joeybaker/Code/sf-pulse/server/migrate.ts) records applied versions in `schema_migrations` and skips already-applied files on later runs.
- Migration tests use `pg-mem` in [server/migrate.test.ts](/Users/joeybaker/Code/sf-pulse/server/migrate.test.ts).

## Rules

- Write standard PostgreSQL first. Do not contort migration SQL to satisfy `pg-mem`.
- If valid PostgreSQL fails in `pg-mem`, use [$pg-mem-upstream-fix](/Users/joeybaker/Code/sf-pulse/.codex/skills/pg-mem-upstream-fix/SKILL.md).
- Every data migration must be safe against duplicate effects when the database state already reflects part of the intended result.
- Prefer deterministic backfills. Avoid "best effort" SQL that can duplicate rows or overwrite unrelated data.

## Workflow

1. Read [server/migrate.ts](/Users/joeybaker/Code/sf-pulse/server/migrate.ts) and the relevant migration files before editing anything.
2. If adding a migration, give it the next numeric prefix and keep it transactional as plain SQL.
3. Design the SQL so re-running the logical effect does not create duplicates or corrupt existing rows.
4. Add or update focused coverage in [server/migrate.test.ts](/Users/joeybaker/Code/sf-pulse/server/migrate.test.ts).
5. When a migration backfills data, add a test that applies earlier migrations first, seeds a partially-migrated state, then runs only the new migration and asserts the final state is correct.
6. Run `node --import tsx/esm --test server/migrate.test.ts` before the full suite.

## Preferred patterns

- Schema creation:
  Use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and similar guards where PostgreSQL supports them.
- Schema evolution:
  Prefer additive changes. When a statement is not naturally repeat-safe, gate it with catalog checks or structure the migration so the runner never needs to reapply it to the same version.
- Data backfills:
  Prefer `UPDATE ... FROM ...` followed by `INSERT ... WHERE NOT EXISTS (...)`, or `ON CONFLICT` when the constraint exists and matches the intended identity.
- Matching existing rows:
  Use stable business keys and explicit predicates. Case-insensitive matching is acceptable only when the data model expects it.

## Test expectations

- Keep the broad migration smoke tests passing.
- Add one narrow test for the new migration's idempotent effect, not just "migration applies".
- If the migration upgrades existing rows instead of inserting new ones, assert both:
  - the final row count
  - the upgraded row contents

## Commands

```bash
node --import tsx/esm --test server/migrate.test.ts
npm test
npm run typecheck
```
