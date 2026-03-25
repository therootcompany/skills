---
name: go-sqlc
description: sqlc query tooling for Go projects. Use when writing, updating, or debugging SQL queries managed by sqlc — including query design rules, batch variants, parameter syntax, type mappings, and regenerating code after query changes.
---

## Overview

No inline SQL in Go code. All queries go through sqlc. Query files live in
`db/queries/` (or similar). Generated code is ephemeral — never committed.

## Regenerating after query changes

After any change to query files:

```sh
sqlc generate
# or if the project has a wrapper:
./scripts/sqlc-generate
```

Always regenerate before running tests or building.

## Query design rules

- **No inline SQL in Go code.** All queries through sqlc. Tool/test queries get their
  own dedicated SQL file.
- **Always provide batch variants.** Any fetch by ID must also accept multiple IDs via
  `= ANY(sqlc.arg('ids')::text[])` (PostgreSQL) or `IN (sqlc.slice('ids'))` (MariaDB/SQLite).
- **Include the grouping column in batch queries.** SELECT must include the grouping key
  (e.g. `resource_id`, `account_id`) so results can be partitioned client-side.
- **Explicit column lists.** Prefer explicit columns over `SELECT *` / `RETURNING *` —
  sqlc generates precise struct types and lets you omit internal-only columns from
  return types.

## Parameter syntax

Always use named parameters — never positional (`$1`, `$2`).

| Form | Use | DB |
|------|-----|----|
| `sqlc.arg('foo')` | required param | all |
| `sqlc.narg('foo')` | nullable/optional param | all |
| `= ANY(sqlc.arg('foos')::text[])` | required IN-list | PostgreSQL |
| `= ANY(sqlc.narg('foos')::text[])` | nullable IN-list | PostgreSQL |
| `sqlc.slice('foo')` | IN-list (expands to `IN (...)`) | MariaDB, SQLite |

Example using the optional `since` filter pattern:

```sql
-- name: FooAll :many
SELECT * FROM foo
WHERE sqlc.narg('since') IS NULL OR updated_at >= sqlc.narg('since')
ORDER BY updated_at ASC, id ASC;
```

The generated Go param will be `sql.NullTime`.

## Query performance

- **Never multi-JOIN for counting across tables.** LEFT JOINing N sub-resource tables
  in one query creates a combinatorial explosion that times out on production. Use
  **correlated subqueries** instead — one `(SELECT COUNT(*) ...)` per table — or
  separate queries.
- **First-write-wins for shared-key maps.** When multiple DB rows share a lookup key,
  add `ORDER BY updated_at DESC, created_at DESC, id DESC` to the query and use
  `if _, exists := m[key]; !exists { m[key] = val }` in Go — most-recently-updated
  row wins deterministically.
- **Study existing query patterns first.** Before writing a new aggregation query, look
  at how similar queries in the codebase are structured. Prefer small, focused,
  one-table-at-a-time queries over large cross-table JOINs.

## Initialisms

sqlc defaults to only `["id"]` as an initialism. Add others to match Go naming conventions — e.g. `dns_name` → `DNSName`, `base_url` → `BaseURL`:

```yaml
# sqlc.yaml
version: "2"
sql:
  - gen:
      go:
        initialisms:
          - "id"
          - "url"
          - "dns"
          - "ip"
```

For one-off column name fixes that initialisms can't cover, use `rename`:

```yaml
gen:
  go:
    rename:
      account_id: "AccountID"
      base_url: "BaseURL"
```

`rename` maps column names to exact Go field names and takes precedence over `initialisms`.

## Type overrides

Override the Go type sqlc generates for a DB column or type. Requires two entries when the column is nullable:

```yaml
gen:
  go:
    overrides:
      # by DB type (both nullable and non-nullable)
      - db_type: "uuid"
        go_type:
          import: "github.com/google/uuid"
          type: "UUID"
      - db_type: "uuid"
        nullable: true
        go_type:
          import: "github.com/google/uuid"
          type: "UUID"
          pointer: true
      # by column (takes precedence over db_type)
      - column: "users.created_at"
        go_type: "time.Time"
```

`go_type` keys: `import`, `package`, `type`, `pointer` (use `*T`), `slice` (use `[]T`).

## PostgreSQL type mappings (pgx/v5)

| SQL type             | Go type            | Notes                      |
|----------------------|--------------------|----------------------------|
| `BYTEA`              | `[]byte`           |                            |
| `encode(col, 'hex')` | `string`           | Return BYTEA as hex string |
| `TEXT[]`             | `[]string`         |                            |
| `TIMESTAMP`          | `pgtype.Timestamp` |                            |
