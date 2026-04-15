---
name: golang-stack
description: Approved Go library stack, import conventions, version features, and build commands. Use when adding a dependency, choosing a library, or checking what Go version features are available.
---

## Stack

Each row is a separate Go module with its own `go.mod`. Import by full path — never import bare `golib`.

```go
import "github.com/therootcompany/golib/auth"           // NOT "golib"
import "github.com/therootcompany/golib/auth/csvauth"   // NOT "golib/auth/csvauth"
```

| Module | Use |
|--------|-----|
| `net/http` (stdlib) | HTTP mux, `r.PathValue()` |
| `github.com/joho/godotenv` | Load .env files |
| `github.com/therootcompany/golib/http/middleware/v2` | Request middleware chain |
| `github.com/therootcompany/golib/auth` | `BasicRequestAuthenticator` — extract credentials from HTTP requests |
| `github.com/therootcompany/golib/auth/envauth` | `BasicCredentials{Username, Password}` — single-user auth from ENV |
| `github.com/therootcompany/golib/auth/csvauth` | `Auth` — multi-user credentials from TSV |
| `github.com/therootcompany/golib/auth/jwt` | `Signer`, `Verifier`, `Validator` — JWT with JWKS |
| `github.com/jackc/pgx/v5` | PostgreSQL driver |
| `github.com/sqlc-dev/sqlc` | SQL → Go type-safe queries |
| `github.com/therootcompany/golib/cmd/sql-migrate/v2` | DB migrations CLI |
| `github.com/jszwec/csvutil` | TSV/CSV encoding |
| `github.com/vearutop/statigz` | Embed static files |
| `github.com/miekg/dns` | Low-level DNS |

CLI tools: `csvauth`, `sql-migrate`, `gsheet2csv`, `gsheet2tsv`, `gsheet2env`.

## Version features

| Feature | Use | Since |
|---------|-----|-------|
| HTTP routing | `mux.HandleFunc("GET /{id}", h)`, `r.PathValue("id")` | 1.22 |
| JSON omitzero | `json:"f,omitzero"` | 1.24 |
| Loop variables | Per-iteration scope | 1.22 |
| Iterators | `iter` package, `range` over func | 1.23 |
| Random | `math/rand/v2` | 1.22 |
| Null types | `database/sql.Null[T]` | 1.22 |
| Crypto CSPRNG | `crypto/*` uses internal CSPRNG | 1.26 |
| PBKDF2 | `crypto/pbkdf2` | 1.24 |

Type safety: avoid `any`; use shallow interfaces or create marker interfaces.

## Installing tools

1. Follow skill instructions
2. `webi go` (then `go install` for Go tools)
3. System package manager — last resort

## Build

- `go build` / `go run` / `go install`
- `go generate ./...` (sqlc, stringer, embed manifests)
- `go tool` (Go 1.24+) for versioned tool dependencies
- POSIX shell scripts in `scripts/` for anything `go` can't express

Codegen directives live in Go source:

```go
//go:generate sqlc generate
//go:generate go tool stringer -type=Status
```

`make` and `Makefile` are not approved.

## Pre-commit

MUST: Run `scripts/golint` before every commit. It walks all `go.mod` files
depth-first and runs `go fmt`, `goimports`, `go fix`, `go vet`, and `go mod tidy`
in each module. Monorepo-aware: leaf modules lint before their dependents.

Copy `scripts/golint` from this skill into the project's `scripts/` directory.

```sh
go generate ./...
./scripts/golint
go test ./...
```

## Config

- No YAML unless required by 3rd party
- POSIX .env for ENVs
- TSV for data exports
