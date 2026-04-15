---
name: golang-stack
description: Approved Go library stack, import conventions, version features, build commands, and pre-commit script. Use when adding a dependency, choosing a library, or checking which Go version features are available.
---

## Stack

Each `golib/*` row is a separate Go module with its own `go.mod`. Import by full path — never import bare `golib`.

```go
import "github.com/therootcompany/golib/auth"           // NOT "golib"
import "github.com/therootcompany/golib/auth/csvauth"   // NOT "golib/auth/csvauth"
```

| Module                                                  | Use                                                |
| ------------------------------------------------------- | -------------------------------------------------- |
| `net/http` (stdlib)                                     | HTTP mux, `r.PathValue()` (1.22+)                  |
| `github.com/joho/godotenv`                              | Load `.env` files                                  |
| `github.com/therootcompany/golib/http/middleware/v2`    | Request middleware chain                           |
| `github.com/therootcompany/golib/auth/...`              | Auth — see `golang-auth` (BasicRequestAuthenticator, envauth, csvauth, jwt) |
| `github.com/jackc/pgx/v5`                               | PostgreSQL driver                                  |
| `github.com/sqlc-dev/sqlc`                              | SQL → Go type-safe queries                         |
| `github.com/therootcompany/golib/cmd/sql-migrate/v2`    | DB migrations CLI                                  |
| `github.com/jszwec/csvutil`                             | TSV/CSV encoding                                   |
| `github.com/vearutop/statigz`                           | Embed static files                                 |
| `github.com/miekg/dns`                                  | Low-level DNS                                      |

CLI tools (via `go install`): `csvauth`, `sql-migrate`, `gsheet2csv`, `gsheet2tsv`, `gsheet2env`.

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

`webi go` for the toolchain, then `go install` for Go-based CLIs. Fall back to system package manager only if `webi` doesn't carry it. (Same install order as `shell-scripting`.)

## Build

- `go build` / `go run` / `go install`
- `go generate ./...` — runs `sqlc`, `stringer`, embed manifests
- `go tool` (Go 1.24+) for versioned tool dependencies
- POSIX shell scripts in `scripts/` for anything `go` can't express

Codegen directives live in Go source:

```go
//go:generate sqlc generate
//go:generate go tool stringer -type=Status
```

NEVER `make` / `Makefile` — not approved.

## Pre-commit

MUST: Run `./scripts/golint` before every commit. Walks every `go.mod` depth-first (leaf modules first, so monorepos lint dependencies before dependents) and runs `go fmt`, `goimports`, `go fix`, `go vet`, `go mod tidy` per module.

First time in a project, copy the script in:

```sh
cp ~/Agents/skills/golang-stack/scripts/golint scripts/
chmod +x scripts/golint
```

Standard pre-commit sequence:

```sh
go generate ./...
./scripts/golint
go test ./...
```

## Config

- NEVER YAML unless required by a 3rd-party tool.
- POSIX `.env` for environment variables (godotenv).
- TSV for data exports — see `design-tsv-json-api-responses`.
