# patches/

Patches applied to `node_modules/` via [patch-package](https://github.com/ds300/patch-package).
Re-applied automatically on `npm install` via the `postinstall` script.

---

## pg-mem+3.0.14.patch

**Package:** `pg-mem@3.0.14`
**File patched:** `index.js` (bundled build — no separate source files in the npm package)

### Bug 1

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

### Upstream target

- Upstream repo: https://github.com/oguimbal/pg-mem
- File to patch in source: `src/execution/create-table.ts`, equivalent lines
  in the `ExecuteCreateTable` constructor, column `'column'` case
- Status: not yet reported — open an issue or PR referencing this file

### Bug 2

Correlated subqueries do not preserve valid PostgreSQL outer-column semantics.
Before the patch, predicates such as:

```sql
WHERE NOT EXISTS (
  SELECT 1
  FROM restaurants AS existing
  WHERE lower(existing.name) = lower(seed.name)
)
```

either fail to resolve `seed.name` or reject the predicate because it spans
inner and outer query origins.

### Fix

- Search outer `selection` frames when the current `selection` misses a column
  or alias.
- Preserve outer-row access while evaluating subqueries.
- Allow evaluators for correlated predicates to span multiple origins instead
  of throwing.

### Upstream targets

- Upstream repo: https://github.com/oguimbal/pg-mem
- Source files from `index.js.map`:
  - `src/parser/context.ts`
  - `src/parser/expression-builder.ts`
  - `src/evaluator.ts`
- Regression test in this repo:
  [server/pg-mem.test.ts](/Users/joeybaker/Code/sf-pulse/server/pg-mem.test.ts)

### Bug 3

CTE bindings parsed with explicit column lists did not apply those names to the
temporary binding. Before the patch, valid PostgreSQL such as:

```sql
WITH seed(name) AS (VALUES ('Benu'), ('Quince'))
SELECT seed.name
FROM seed
```

failed because the binding kept its anonymous source column names instead of
the explicit `name` column list.

### Fix

Thread `columnNames` through `buildWith(...)` and apply them with
`mapColumns(...)` before registering the temp binding.

### Upstream target

- Upstream repo: https://github.com/oguimbal/pg-mem
- Source file from `index.js.map`: `src/execution/select.ts`
- Regression test in this repo:
  [server/pg-mem.test.ts](/Users/joeybaker/Code/sf-pulse/server/pg-mem.test.ts)

### Bug 4

Top-level data-modifying `WITH` statements are rejected as read-only. Before
the patch, valid PostgreSQL statements such as:

```sql
WITH seed(name) AS (VALUES ('Benu'))
UPDATE restaurants
SET name = 'Quince'
WHERE name IN (SELECT name FROM seed)
```

and:

```sql
WITH seed(name) AS (VALUES ('Quince'))
INSERT INTO restaurants (name)
SELECT name
FROM seed
```

failed with `"WITH" nested statement with query type 'update'` or `'insert'`.

### Fix

Allow the final statement in a top-level `WITH` to use `buildWithable(...)`
instead of forcing it through the read-only `buildSelect(...)` path. Nested
`WITH` handling remains read-only.

### Upstream target

- Upstream repo: https://github.com/oguimbal/pg-mem
- Source file from `index.js.map`: `src/execution/select.ts`
- Regression tests in this repo:
  [server/pg-mem.test.ts](/Users/joeybaker/Code/sf-pulse/server/pg-mem.test.ts)
  and [server/migrate.test.ts](/Users/joeybaker/Code/sf-pulse/server/migrate.test.ts)

---

## pgsql-ast-parser+12.0.2.patch

**Package:** `pgsql-ast-parser@12.0.2`
**Files patched:** `index.js`, `src/syntax/with.ne`

### Bug

Non-recursive CTE bindings reject valid PostgreSQL column lists such as:

```sql
WITH seed(name) AS (VALUES ('Benu'))
SELECT seed.name
FROM seed
```

Recursive CTEs already support column lists; non-recursive bindings were simply
missing the optional `collist_paren` slot in the grammar.

### Fix

Allow an optional `collist_paren` between the CTE name and `AS` in
`with_statement_binding`, then thread the parsed names into `columnNames`.

### Upstream target

- Upstream repo: https://github.com/oguimbal/pgsql-ast-parser
- Source file: `src/syntax/with.ne`
- Regression test in this repo:
  [server/pgsql-ast-parser.test.ts](/Users/joeybaker/Code/sf-pulse/server/pgsql-ast-parser.test.ts)
