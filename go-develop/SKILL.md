---
name: go-develop
description: Go development conventions. Use when writing Go HTTP handlers, routes, middleware, migrations, or data endpoints.
---

## Stack

| Component | Library |
|-----------|---------|
| Go | 1.26+ |
| ENV | godotenv |
| HTTP | `net/http` mux, `r.PathValue()` |
| UI Embed | `github.com/vearutop/statigz` |
| Middleware | `github.com/therootcompany/golib/http/middleware` |
| Database | `github.com/jackc/pgx/v5` |
| ORM | sqlc |
| Migrations | `github.com/therootcompany/golib/cmd/sql-migrate/v2` @ v2.1.1 |
| JWT | `github.com/therootcompany/golib/auth/jwt` |
| Data | `github.com/jszwec/csvutil` (TSV default) |
| DNS (providers) | `github.com/libdns/libdns` — approved; use for multi-provider DNS |
| DNS (low-level) | `github.com/miekg/dns` — approved when `net` stdlib is not sufficient (e.g. raw queries, custom resolvers, DNSSEC); prefer stdlib `net.Resolver` for simple lookups |

CLI tools: `envauth` (env-based auth), `csvauth` (CSV auth), `gsheet2csv` (Google Sheet → CSV), `gsheet2env` (Google Sheet → .env).

Type safety: avoid `any`; use shallow interfaces or create marker interfaces.

## Version features

| Feature | Use | Since |
|---------|-----|-------|
| HTTP routing | `mux.HandleFunc("GET /{id}", h)`, `r.PathValue("id")` | 1.22 |
| JSON omitzero | `json:"f,omitzero"` for T vs *T and NullBool | 1.24 |
| Loop variables | Per-iteration scope (no `i := i`) | 1.22 |
| Iterators | `iter` package, `range` over func | 1.23 |
| Random | `math/rand/v2` | 1.22 |
| Null types | `database/sql.Null[T]` | 1.22 |
| Crypto CSPRNG | `crypto/*` uses internal CSPRNG | 1.26 |
| Crypto big ints | `.Bytes()` methods instead of `math/big` | 1.25 |
| PBKDF2 | `crypto/pbkdf2` | 1.24 |

Version history (for citing): 1.26 (CSPRNG, inline pointer `new(T{f: v})`), 1.25 (`.Bytes()`), 1.24 (`omitzero`, `os.Root`, `go tool`), 1.23 (iter), 1.22 (ServeMux, per-iteration loops, `range` int).

Ref: https://go.dev/doc/go1.xx

## Production-first

Build for production from the start. Error handling, logging, auth, graceful shutdown are part of initial implementation, not polish.

## API Router

```go
mux := http.NewServeMux()
mux.HandleFunc("GET /api/items", handleListItems)
mux.HandleFunc("GET /api/items/{id}", handleGetItem)
mux.HandleFunc("POST /api/items", handleCreateItem)
```

## Middleware

```go
// import "github.com/therootcompany/golib/http/middleware"
baseM := middleware.New(loggingMiddleware, realIPMiddleware)
authM := baseM.Add(jwtMiddleware)
adminM := authM.Add(requireAdminMiddleware)
mux.Handle("GET /api/items", authM.Then(handleListItems))
```

## CLI Flags

Use `flag.FlagSet` (not the global `flag` package) so subcommands and libraries stay composable:

```go
fs := flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
verbose := fs.Bool("verbose", false, "verbose output")
human := fs.Bool("h", false, "human-readable output")  // -h reserved for --human-readable
if err := fs.Parse(os.Args[1:]); err != nil {
    if errors.Is(err, flag.ErrHelp) {
        os.Exit(0)
    }
    os.Exit(1)
}
```

### Help and version aliases

Handle before calling `fs.Parse`:

```go
if len(os.Args) > 1 {
    switch os.Args[1] {
    case "-V", "-version", "--version", "version":
        printVersion(os.Stdout)
        os.Exit(0)
    case "help", "-help", "--help":
        printVersion(os.Stdout)
        _, _ = fmt.Fprintln(os.Stdout, "")
        fs.SetOutput(os.Stdout)
        fs.Usage()
        os.Exit(0)
    }
}
```

`fs.SetOutput(os.Stdout)` is required because `flag.FlagSet` defaults to stderr; help should go to stdout.

**Flag reservations:**
- `-h` — `--human-readable` (never `--help`)
- `-v` — `--verbose` (never `--version`)
- `-V`, `-version`, `--version`, `version` — print version and exit
- `help`, `-help`, `--help` — print version + blank line + usage, then exit

## Config

- No YAML unless required by a 3rd party tool
- POSIX .env for ENVs
- TSV for data exports
- Add bins to .gitignore

## TSV Endpoint

### 1. SQL query

```sql
-- name: ItemAll :many
SELECT id, name, created_at, updated_at
FROM items
WHERE sqlc.narg('since') IS NULL OR updated_at >= sqlc.narg('since')
ORDER BY updated_at ASC, id ASC;
```

### 2. Generate

```sh
sqlc generate
```

### 3. Handler

```go
// import "github.com/jszwec/csvutil"
func HandleItemsAllTSV(w http.ResponseWriter, r *http.Request) {
    since := parseOptionalTime(r.URL.Query().Get("since"))
    rows, err := queries.ItemAll(r.Context(), db.ItemAllParams{Since: since})
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    w.Header().Set("Content-Type", "text/tab-separated-values; charset=utf-8")
    enc := csvutil.NewEncoder(w)
    enc.Delimiter = '\t'
    for _, row := range rows {
        if err := enc.Encode(row); err != nil {
            return
        }
    }
}
```

Use `csv:",inline"` to flatten nested structs into a row. Offer `.json` suffix as secondary format.

### 4. Register

```go
mux.Handle("GET /api/items.tsv", authM.Then(HandleItemsAllTSV))
mux.Handle("GET /api/items.json", authM.Then(HandleItemsAllJSON))
```

## Migrations

Install: `go install github.com/therootcompany/golib/cmd/sql-migrate/v2@v2.1.1`

This is a **CLI-only** tool (package main — no Go library API). It generates shell scripts; it does not connect to the DB itself. The `_migrations` table in the DB is updated by the migration SQL files themselves.

### Init (once per project)

```sh
# PostgreSQL (default for prod)
sql-migrate -d ./db/migrations init --sql-command psql

# SQLite (dev)
sql-migrate -d ./db/migrations init --sql-command 'sqlite3 "$DB_PATH" < %s'
```

The init creates:
- `db/migrations/0001-01-01-001000_init-migrations.up.sql` — config vars + `CREATE TABLE _migrations`
- `db/migrations/0001-01-01-001000_init-migrations.down.sql`
- `db/migrations/_migrations.sql` — query used to reload the log

### Create a migration

```sh
sql-migrate -d ./db/migrations create add-users-table
```

Generates a dated pair: `2026-03-23-001000_add-users-table.{up,down}.sql`

### Sync log from DB (run before every `up`)

`sql-migrate` tracks applied migrations in a local log file (`db/migrations.log`). Before running `up`, refresh it from the DB:

```sh
sql-migrate -d ./db/migrations sync | sh
```

The `|| true` in the generated script is intentional: a fresh DB with no `_migrations` table produces an empty log, meaning all migrations are pending.

### Apply / rollback

```sh
# Sync then apply all pending migrations
sql-migrate -d ./db/migrations sync | sh
sql-migrate -d ./db/migrations up | sh

# Rollback last migration
sql-migrate -d ./db/migrations down | sh
```

**Deploy sequence:**
```sh
sql-migrate -d ./db/migrations sync | sh
sql-migrate -d ./db/migrations up | sh
```

### Naming: `YYYY-MM-DD-NNNNNN_description.up.sql` / `.down.sql`

Each migration file tracks itself in the DB:
- Up begins: `INSERT INTO _migrations (name, id) VALUES ('2026-03-23-001000_add-users', 'a1b2c3d4');`
- Down ends: `DELETE FROM _migrations WHERE id = 'a1b2c3d4';`
- Generate ID: `openssl rand -hex 4`

The migrations log (`db/migrations.log`) is a flat text file on disk — add it to `.gitignore`. It is reloaded from the DB with `_migrations.sql` when needed.

### Go app: no self-migration at startup

With sql-migrate, the Go app does **not** call `db.Exec(schema)` at startup. The DB is migrated by the operator before deploying:

```sh
sql-migrate -d ./db/migrations up | sh   # part of deploy process
```

### sqlc schema

Keep `db/schema.sql` as the full current schema for sqlc. Migrations implement it incrementally; `schema.sql` is the truth for type generation. Point sqlc at it:

```yaml
# sqlc.yaml
schema: "db/schema.sql"
```

## JWT

### Issue

```go
// import "github.com/therootcompany/golib/auth/jwt"
pk, _ := jwk.NewPrivateKey()
signer, _ := jwt.NewSigner([]jwk.PrivateKey{*pk})
tokenStr, _ := signer.SignToString(&claims)
```

### Verify

```go
verifier := signer.Verifier()
jws, _ := verifier.VerifyJWT(tokenStr)
var claims AppClaims
jwt.UnmarshalClaims(jws, &claims)
```

### Claims

```go
type AppClaims struct {
    jwt.IDTokenClaims
    Roles []string `json:"roles"`
}
```

### JWKS endpoint

```go
json.Marshal(&signer) // {"keys":[...]}
```

### Remote JWKS

```go
fetcher := &jwt.KeyFetcher{
    URL: "https://issuer.example.com/.well-known/jwks.json",
    MaxAge: time.Hour,
    StaleAge: 30 * time.Minute,
}
verifier, _ := fetcher.Verifier()
```

### Validate

```go
validator := jwt.NewIDTokenValidator(
    []string{"https://issuer.example.com"},
    []string{"my-service"},
    nil, // azp
)
errs := validator.Validate(nil, &claims, time.Now())
if len(errs) > 0 {
    // handle validation errors
}
```

For OAuth 2.1 access tokens:

```go
validator := jwt.NewAccessTokenValidator(
    []string{"https://issuer.example.com"},
    []string{"my-service"},
    "openid", "profile",
)
```

### Algorithms

Ed25519 (EdDSA), EC P-256/384/521 (ES256/384/512), RSA (RS256). Algorithm inferred from key type — never configured manually.

### JWK key management

```go
pk, _ := jwk.NewPrivateKey()
keys, _ := jwk.ReadFile("path/to/keys.jwks")
data, _ := json.Marshal(jwk.JWKs{Keys: verifier.PublicKeys()})
switch key := pub.CryptoPublicKey.(type) {
case *ecdsa.PublicKey:
case *rsa.PublicKey:
case ed25519.PublicKey:
}
```

## Error Handling

### Sentinel errors

```go
var ErrNotFound = errors.New("not found")
```

### Wrapping order: less specific → more specific

```go
fmt.Errorf("%w: exp: token expired", ErrInvalidClaim)  // broad first
fmt.Errorf("header json: %w", err)                      // specific last
fmt.Errorf("payload base64: %w: %w", ErrInvalidPayload, err)  // Go 1.20+
```

### Composable hierarchies

```go
var (
    ErrInvalidClaim = errors.New("invalid claim value")
    ErrAfterExp  = fmt.Errorf("%w: exp: token expired", ErrInvalidClaim)
    ErrBeforeNbf = fmt.Errorf("%w: nbf: token not yet valid", ErrInvalidClaim)
)
// errors.Is(err, ErrAfterExp)    — matches expired only
// errors.Is(err, ErrInvalidClaim) — matches any invalid
```

### Multi-error

```go
errs = append(errs, fmt.Errorf("exp: %w", ErrMissingClaim))
return errors.Join(errs...)
```

## Testing

Prefer real code over mocks. Test actual behavior — real DB queries, real handler logic — not fakes that only verify wiring.

## Build

Use `go generate`, direct `go` commands, and POSIX shell scripts in `scripts/`.

- `go build` / `go run` / `go install` for compiling
- `go generate ./...` for code generation (sqlc, stringer, embed manifests, etc.)
- `go tool` (Go 1.24+) for versioned tool dependencies declared in `go.mod`
- POSIX shell scripts in `scripts/` for anything `go` can't express directly
  (e.g. cross-compilation with env overrides, scp + remote restart for deploy)

Codegen directives live in the Go source files they affect:

```go
//go:generate sqlc generate
//go:generate go tool stringer -type=Status
```

`make` and `Makefile` are not approved or supported.

## Pre-commit

```sh
go generate ./...
go fmt ./...
goimports -w .
go fix ./...
go test ./...
go vet ./...
```

If sqlc-generated packages produce spurious vet warnings, use a wrapper script that excludes them. See [sqlc query design skill](../sqlc-query-design/SKILL.md).

## Go doc

```sh
go doc <package>
go doc <package>.<Symbol>
go doc -all <package>
go doc -src <package>.<Symbol>
```
