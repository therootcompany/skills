---
name: go-db-migrations
description: Database schema migrations with sql-migrate CLI. Use when creating migrations, adding tables, altering columns, running up/down migrations, or initializing a migrations directory. Covers sql-migrate init, create, up, down, status, list, and sqlc integration.
depends: [golang-sqlc]
---

<!-- core -->

## Critical Rules

- MUST: Use sql-migrate for all schema changes. Never raw `CREATE TABLE` in Go code.
- MUST: Run `sqlc generate` after any migration that changes tables referenced by queries.
- MUST: The Go app does NOT self-migrate at startup. Migrations run via generated shell scripts.
- NEVER: Edit the `INSERT INTO _migrations` / `DELETE FROM _migrations` lines that sql-migrate generates. They track applied state.
- NEVER: Manually renumber migration files. Use `sql-migrate create` to get the next number.

## Install

```sh
go install github.com/therootcompany/golib/cmd/sql-migrate/v2@v2.1.1

# VERIFY:
sql-migrate --version
# sql-migrate v2.0.3
```

<!-- /core -->

## Initialize

```sh
sql-migrate -d ./store/sql/migrations init --sql-command 'sqlite3 "$SQLITE_PATH" < %s'
```

Built-in aliases for `--sql-command`:

| Alias | Expands to |
|-------|-----------|
| `psql`, `postgres`, `pg` | `psql "$PG_URL" -v ON_ERROR_STOP=on -A -t --file %s` |
| `mariadb` | `mariadb --defaults-extra-file="$MY_CNF" -s -N --raw < %s` |
| `mysql`, `my` | `mysql --defaults-extra-file="$MY_CNF" -s -N --raw < %s` |

For SQLite, pass a custom command string with `%s` placeholder.

Init creates:
1. `0001-01-01-01000_init-migrations.up.sql` - config directives + `_migrations` table
2. `0001-01-01-01000_init-migrations.down.sql` - drops `_migrations` table
3. `_migrations.sql` - query file for refreshing the log
4. `../migrations.log` - tracks which migrations have been applied

**SQLite adjustment:** The default init migration uses PostgreSQL syntax for `_migrations`. For SQLite, edit the initial up migration:

```sql
-- replace the CREATE TABLE with:
CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Create a Migration

```sh
sql-migrate -d ./store/sql/migrations create add-users-table
```

Generates a paired up/down file:
```
2026-03-30-001000_add-users-table.up.sql
2026-03-30-001000_add-users-table.down.sql
```

**Naming format:** `YYYY-MM-DD-NNNNNN_kebab-description.{up|down}.sql`

- Date = today
- Number starts at 001000, increments by 1000 for same-day migrations
- Description is lowercased, kebab-cased from your argument

**Up file template:**
```sql
-- leave this as the first line
INSERT INTO _migrations (name, id) VALUES ('2026-03-30-001000_add-users-table', 'a1b2c3d4');

-- add-users-table (up)
CREATE TABLE users ( ... );
```

**Down file template:**
```sql
-- add-users-table (down)
DROP TABLE IF EXISTS users;

-- leave this as the last line
DELETE FROM _migrations WHERE id = 'a1b2c3d4';
```

## Run Migrations

sql-migrate generates shell scripts - pipe to `sh` to execute:

```sh
# Apply all pending migrations
sql-migrate -d ./store/sql/migrations up | sh

# Apply only next 2 pending
sql-migrate -d ./store/sql/migrations up 2 | sh

# Roll back most recent migration
sql-migrate -d ./store/sql/migrations down | sh

# Roll back last 3 migrations
sql-migrate -d ./store/sql/migrations down 3 | sh
```

**Preview without running:** omit `| sh` to see the generated script.

The generated script:
- Sources `.env` if present (for `$PG_URL`, `$SQLITE_PATH`, etc.)
- Runs each migration SQL file via the configured sql command
- After each migration, refreshes `migrations.log` from the `_migrations` table

## Check Status

```sh
# Show applied vs pending
sql-migrate -d ./store/sql/migrations status

# List all migration files
sql-migrate -d ./store/sql/migrations list
```

## sqlc Integration

Point sqlc's `schema:` at the migrations directory so it reads DDL from migration files:

```yaml
# sqlc.yaml
version: "2"
sql:
  - engine: "sqlite"
    queries: "sql/queries.sql"
    schema: "sql/migrations/"
    gen:
      go:
        package: "sqlgen"
        out: "sqlgen"
```

sqlc parses all `.sql` files in the migrations directory and understands the schema from `CREATE TABLE` statements. The `INSERT INTO _migrations` tracking lines are harmless - sqlc ignores DML.

**Workflow after schema change:**
1. `sql-migrate create add-whatever`
2. Write DDL in the up/down files
3. `sqlc generate` to regenerate Go types
4. Update Go code to use new/changed types
5. `sql-migrate up | sh` to apply on dev DB

## Migrations Log

`migrations.log` is a plain text file, one migration name per line:
```
0001-01-01-01000_init-migrations
2026-03-30-001000_init-tables
2026-03-30-002000_add-indexes
```

- Hand-editable for dev/testing: remove a line to "un-apply" a migration, then re-run `up`
- Refreshed automatically after each `up`/`down` by querying `_migrations` table

## Related Skills

- `golang-sqlc` - query design and code generation (reads migration files as schema)
- `golang-stack` - approved libraries and build commands
