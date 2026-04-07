# pg-mem patch workflow

This repo treats PostgreSQL as the source of truth. If `pg-mem` disagrees with
valid PostgreSQL behavior, patch `pg-mem`; do not rewrite app SQL to satisfy
the emulator.

## Current patches

1. `CREATE TABLE IF NOT EXISTS` AST coverage false positive.
   Upstream target: `src/execution/schema-amends/create-table.ts`
2. Correlated subquery outer-column resolution inside expressions such as
   `lower(existing.name) = lower(seed.name)`.
   Upstream targets:
   - `src/parser/context.ts`
   - `src/parser/expression-builder.ts`
   - `src/evaluator.ts`
3. Non-recursive CTE column lists such as `WITH seed(name) AS (...)`.
   Upstream package: `pgsql-ast-parser`
   Upstream target: `src/syntax/with.ne`
4. Parsed CTE column lists were not applied to `pg-mem` temp bindings.
   Upstream target: `src/execution/select.ts`
5. Top-level `WITH ... INSERT/UPDATE/DELETE` statements rejected as read-only.
   Upstream target: `src/execution/select.ts`
6. `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)` window expressions were
   rejected as unsupported.
   Upstream target: `src/parser/expression-builder.ts`
7. Standard `pg_catalog` helpers `btrim(text)` and `nullif(text, text)` were
   missing.
   Upstream target: `src/schema/pg-catalog/index.ts`

The npm bundle ships `index.js` plus `index.js.map`. Use the source map to map
bundle edits back to upstream TypeScript files.

## Required workflow

1. Reproduce the mismatch with the smallest SQL statement possible.
2. Add or update a focused regression test in this repo.
3. Patch `node_modules/pg-mem/index.js`.
4. Regenerate patches with `npx patch-package pg-mem pgsql-ast-parser`.
5. Update [patches/README.md](/Users/joeybaker/Code/sf-pulse/patches/README.md).
6. Run `node --import tsx/esm --test server/pgsql-ast-parser.test.ts server/pg-mem.test.ts server/migrate.test.ts`.
7. Run `npm test` and `npm run typecheck`.

## Upstream issue and PR checklist

Open one issue and one PR per bug. Include:

- Minimal SQL reproduction
- Actual PostgreSQL result
- Current `pg-mem` result
- The focused regression test added in this repo
- Source-map target files from `index.js.map`
- Why app SQL was left unchanged

## Target PR set

1. `pg-mem`: fix AST coverage handling for `CREATE TABLE IF NOT EXISTS`.
   Target file: `src/execution/schema-amends/create-table.ts`
2. `pg-mem`: fix correlated outer-column resolution in subqueries.
   Target files:
   - `src/parser/context.ts`
   - `src/parser/expression-builder.ts`
   - `src/evaluator.ts`
3. `pgsql-ast-parser`: support non-recursive CTE column lists.
   Target file: `src/syntax/with.ne`
4. `pg-mem`: apply parsed CTE `columnNames` to temp bindings.
   Target file: `src/execution/select.ts`
5. `pg-mem`: allow top-level data-modifying `WITH` statements.
   Target file: `src/execution/select.ts`
6. `pg-mem`: support `ROW_NUMBER() OVER (...)` window expressions.
   Target file: `src/parser/expression-builder.ts`
7. `pg-mem`: add standard `btrim(text)` and `nullif(text, text)` built-ins.
   Target file: `src/schema/pg-catalog/index.ts`

Keep each PR narrow. The point is to upstream the emulator fix, not to teach the
app to avoid standard PostgreSQL.

## Commands

```bash
node --import tsx/esm --test server/pgsql-ast-parser.test.ts server/pg-mem.test.ts server/migrate.test.ts
npx patch-package pg-mem pgsql-ast-parser
npm test
npm run typecheck
```
