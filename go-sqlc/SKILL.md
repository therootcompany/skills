---
name: go-sqlc
description: sqlc query tooling for Go projects. Use when writing, updating, or debugging SQL queries managed by sqlc - including query design rules, batch variants, parameter syntax, type mappings, and regenerating code after query changes.
tier: core
max-tokens: 1200
---

<!-- core -->

## Overview

MUST: No inline SQL in Go code. All queries go through sqlc. Query files live in
`db/queries/` (or similar). Generated code is ephemeral - never committed.

## Regenerating after query changes

MUST: After any change to query files, regenerate before building or testing:

```sh
sqlc generate
```

## Query design rules

- MUST: No inline SQL in Go code. Tool/test queries get their own SQL file.
- MUST: Batch variants for every fetch-by-ID. Use `IN (sqlc.slice('ids'))` (MariaDB)
  or `= ANY(sqlc.arg('ids')::text[])` (PostgreSQL).
- MUST: Include the grouping column in batch queries (e.g. `resource_id`) so
  results can be partitioned client-side.
- PREFER: Explicit column lists over `SELECT *` / `RETURNING *`.

## Parameter syntax

MUST: Named parameters only - never positional (`$1`, `$2`).

| Form | Use | DB |
|------|-----|----|
| `sqlc.arg('foo')` | required param | all |
| `sqlc.narg('foo')` | nullable/optional param | all |
| `= ANY(sqlc.arg('ids')::text[])` | required IN-list | PostgreSQL |
| `sqlc.slice('ids')` | IN-list | MariaDB, SQLite |

Optional filter pattern:

```sql
-- name: FooAll :many
SELECT * FROM foo
WHERE sqlc.narg('since') IS NULL OR updated_at >= sqlc.narg('since')
ORDER BY updated_at ASC, id ASC;
```

## Query performance

- NEVER: Multi-JOIN for counting across tables. Use correlated subqueries
  `(SELECT COUNT(*) ...)` per table, or separate queries.
- MUST: First-write-wins for shared-key maps. Add `ORDER BY updated_at DESC,
  created_at DESC, id DESC` and use `if _, exists := m[key]; !exists { m[key] = val }`.
- PREFER: IF writing a new aggregation query, THEN grep `SELECT.*COUNT` in
  `db/queries/` and match the style of existing queries.

<!-- /core -->

## Initialisms

sqlc defaults to only `["id"]` as an initialism. Add others to match Go naming
conventions - e.g. `dns_name` => `DNSName`, `base_url` => `BaseURL`:

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

Override the Go type sqlc generates for a DB column or type. Requires two
entries when the column is nullable:

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

### Custom types (sql.Scanner/driver.Valuer)

sqlc overrides work with any Go type implementing `sql.Scanner` and `driver.Valuer`. Use for JSONB, domain-specific types, or custom null handling.

**Pattern:**
```go
type CustomType struct{ Data any }
func (c *CustomType) Scan(value interface{}) error { /* read from DB */ }
func (c CustomType) Value() (driver.Value, error) { /* write to DB */ }
```

**JSONB override:**
```yaml
overrides:
  - db_type: "jsonb"
    go_type: { import: "github.com/project/internal/types", type: "JSONB" }
  - db_type: "jsonb"
    nullable: true
    go_type: { import: "github.com/project/internal/types", type: "JSONB", pointer: true }
```

**Nullable types (Go 1.22+):** `sql.Null[T]` works for any type.
```yaml
- db_type: "text"
  nullable: true
  go_type: { import: "database/sql", type: "Null[string]" }
```

**Nullable types (non-generic):** `sql.NullBool`, `sql.NullString`, `sql.NullInt64`, `sql.NullFloat64`, `sql.NullTime`. Use `sql.Null[T]` (Go 1.22+) for types without a non-generic equivalent.

## Schema migrations

MUST: Use `sql-migrate` for schema changes — not raw `CREATE TABLE` in Go code.
See the `go-db-migrations` skill for CLI usage and migration file conventions.

sqlc reads migration files as schema source. Point `schema:` in `sqlc.yaml` at
the same migrations directory:

```yaml
sql:
  - schema: "db/migrations/"   # sql-migrate migration files
    queries: "db/queries/"
```

After adding or changing a migration, run `sqlc generate` to regenerate Go types.

## PostgreSQL type mappings (pgx/v5)

| SQL type             | Go type            | Notes                      |
|----------------------|--------------------|----------------------------|
| `BYTEA`              | `[]byte`           |                            |
| `encode(col, 'hex')` | `string`           | Return BYTEA as hex string |
| `TEXT[]`             | `[]string`         |                            |
| `TIMESTAMP`          | `pgtype.Timestamp` |                            |
| `JSONB`              | Custom `JSONB`     | Implements `Scanner/Valuer` |