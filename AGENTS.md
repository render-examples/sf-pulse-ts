# AGENTS.md

- PostgreSQL is the source of truth in this repo. Never rewrite application SQL or behavior to work around `pg-mem` limitations.
- If valid PostgreSQL fails in `pg-mem`, patch `pg-mem` with `patch-package`, add a focused regression test, and update [patches/README.md](/Users/joeybaker/Code/sf-pulse/patches/README.md) plus [docs/pg-mem-upstreaming.md](/Users/joeybaker/Code/sf-pulse/docs/pg-mem-upstreaming.md).
