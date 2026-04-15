---
name: golang
description: Go project conventions — index of focused skills, error handling, and config rules. Load this first; it points to the right sub-skill for any Go task.
---

## Focused skills

| Skill                      | When to use                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| `golang-stack`             | Approved libraries, import paths, version features, build commands |
| `golang-http-handlers`     | HTTP handlers, ServeMux routes, middleware                         |
| `golang-cli-flags`         | CLI tools, flag.FlagSet, argument parsing                          |
| `golang-auth`              | Authentication, API keys, JWT, csvauth                             |
| `go-db-migrations`         | Database schema migrations                                         |
| `golang-sqlc`              | sqlc query design, code generation                                 |
| `golang-import-sheet-data` | Google Sheets to CSV/TSV/ENV                                       |
| `golang-review-style`      | Code style/architecture review with named agents                   |
| `golang-review-security`   | Security vulnerability review with named agents                    |

## Project structure

`./cmd/*` is for wiring: config, CLI flags, environment, routes, and server startup.
For non-trivial commands and servers, private implementation details go in `./internal/`.
If unsure whether something belongs in `cmd` or `internal`, ask.

## Package naming

- MUST: Directory name matches the `package` declaration. If the package is
  `mcpauth`, the directory is `mcpauth/`, not `auth/`.
- PREFER: Stutter in the import path over requiring an import alias.
  `"…/mcptools/mcpauth"` is better than `mcpauth "…/mcptools/auth"`.
- Aliases hide the real package name from the import path, making code harder
  to navigate and grep. A reader should be able to find the package directory
  from the import path alone.

## Pre-commit

MUST: Run `scripts/golint` before every commit in Go projects. The script
lives in `golang-stack/scripts/golint` and handles monorepos (depth-first
`go.mod` walk with fmt, imports, fix, vet, tidy per module). Copy it into
the project's `scripts/` directory.

## Error Handling

MUST check errors, or explicitly discard

```go
_ = f.Close()

defer func() {
    _ = f.Close()
}
```

NEVER use `//nolint:errcheck`

```go
// Sentinel errors
var ErrNotFound = errors.New("not found")

// Wrapping: broad → specific
fmt.Errorf("%w: exp: token expired", ErrInvalidClaim)

// Composable hierarchies
var ErrAfterExp = fmt.Errorf("%w: exp: token expired", ErrInvalidClaim)

// Multi-error
return errors.Join(append(errs, fmt.Errorf("exp: %w", ErrMissingClaim))...)
```

### Sentinel errors at trust boundaries

MUST: At every package boundary where callers need to branch on failure
mode, return a **sentinel** error the caller can match with `errors.Is`.
Do NOT return raw `err.Error()` strings to clients, and do NOT force
callers to string-match messages.

- Store/repo packages: return `ErrNotFound`, `ErrConflict`,
  `ErrTenantNotFound`, etc. Wrap unexpected failures with
  `fmt.Errorf("pkg: context: %w", err)` so the sentinel still matches.
- HTTP handlers: map sentinels to status codes + short client message.
  Log the full error (and a request ID) server-side; return an opaque
  `"internal error"` + request ID for unexpected failures so clients
  can report it without leaking infra detail.

```go
switch {
case errors.Is(err, store.ErrNotFound):
    http.Error(w, "not found", 404)
case errors.Is(err, store.ErrConflict):
    http.Error(w, "conflict", 409)
default:
    log.Printf("req=%s: %v", reqID, err)
    http.Error(w, "internal error: "+reqID, 500)
}
```

### Context propagation

MUST: Every function that performs I/O (DB, HTTP, file, network) takes
`ctx context.Context` as its first parameter. No exceptions for "just
a small helper" — callers must be able to cancel.

- HTTP handlers: pass `r.Context()` into every downstream call.
- Workers/pollers: the ctx that runs the loop.
- `main`: build a root ctx with `signal.NotifyContext(context.Background(),
  os.Interrupt, syscall.SIGTERM)` and thread it down. This is what makes
  Ctrl-C / SIGTERM cancel in-flight work instead of blocking shutdown.
- NEVER use `context.Background()` inside a library method — accept the
  caller's ctx. Break the chain and you lose request timeouts, tracing,
  and cancellation in one move.

Store interfaces must be `CreateFoo(ctx context.Context, …) error`, not
`CreateFoo(…) error`. This is a load-bearing signature — a package that
omits ctx forces every caller to forfeit cancellation.

## Config

- No YAML unless required by 3rd party
- POSIX .env for ENVs
- TSV for data exports

## Example files

See `references/examples/` for full code examples:

- `jwt_example.go` — JWT signing and verification
- `auth_example.go` — csvauth with BasicRequestAuthenticator
- `envauth_example.go` — single-user envauth
- `gsheet_example.go` — Google Sheets import

## Troubleshooting

- `references/testing-gotchas.md` — subtle test fixture bugs. Load when
  writing integration tests with cleanup, or when "it passes once then
  fails" on repeat runs.
