---
name: golang
description: Go project conventions index — points to the right sub-skill for any Go task and covers project structure, package naming, pre-commit, error handling (sentinels at boundaries), and context propagation. Load first for any Go work.
---

## Focused skills

| Skill                      | When to use                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| `golang-stack`             | Approved libraries, import paths, version features, build commands   |
| `golang-http-handlers`     | HTTP handlers, ServeMux routes, middleware                           |
| `golang-cli-flags`         | CLI tools, `flag.FlagSet`, argument parsing                          |
| `golang-auth`              | Authentication, API keys, JWT, csvauth                               |
| `golang-sqlc`              | sqlc query design, code generation                                   |
| `sql-db-migrations`        | DB schema migrations (index — picks the right migration sub-skill)   |
| `golang-import-sheet-data` | Google Sheets → CSV/TSV/ENV                                          |
| `use-modern-go`            | Modern syntax for the project's Go version (`for range N`, etc.)     |
| `golang-review-style`      | Code style/architecture review with named agents                     |
| `golang-review-security`   | Security vulnerability review with named agents                      |

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

MUST: Run `./scripts/golint` before every commit. Monorepo-aware (depth-first
`go.mod` walk: fmt, imports, fix, vet, tidy per module). Copy it from
`~/Agents/skills/golang-stack/scripts/golint` into the project's `scripts/`
on first use.

## Error handling

- MUST: Check every error or explicitly discard with `_ =`. NEVER use `//nolint:errcheck`.
- MUST: Return sentinel errors at package boundaries where callers branch on failure mode. Callers match with `errors.Is`; clients never see raw `err.Error()`.

```go
// Discard intentionally
_ = f.Close()
defer func() { _ = f.Close() }()

// Sentinels + wrapping (broad → specific). Wrap unexpected failures so
// the sentinel still matches under errors.Is.
var ErrNotFound    = errors.New("not found")
var ErrInvalidClaim = errors.New("invalid claim")
var ErrAfterExp    = fmt.Errorf("%w: exp: token expired", ErrInvalidClaim)

return fmt.Errorf("store: lookup %s: %w", id, ErrNotFound)
return errors.Join(errs...) // multi-error: collect, return once
```

Boundary mapping — store returns sentinels, handler maps them:

```go
switch {
case errors.Is(err, store.ErrNotFound):
    http.Error(w, "not found", 404)
case errors.Is(err, store.ErrConflict):
    http.Error(w, "conflict", 409)
default:
    reqID := middleware.RequestID(r.Context())
    log.Printf("req=%s: %v", reqID, err)        // full detail server-side
    http.Error(w, "internal error: "+reqID, 500) // opaque + req ID for client
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
