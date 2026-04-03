---
name: go
description: Go project conventions — index of focused skills, error handling, and config rules. Load this first; it points to the right sub-skill for any Go task.
---

## Focused skills

| Skill | When to use |
|-------|-------------|
| `go-stack` | Approved libraries, import paths, version features, build commands |
| `go-http-handlers` | HTTP handlers, ServeMux routes, middleware |
| `go-cli-flags` | CLI tools, flag.FlagSet, argument parsing |
| `go-auth` | Authentication, API keys, JWT, csvauth |
| `go-db-migrations` | Database schema migrations |
| `go-sqlc` | sqlc query design, code generation |
| `go-import-sheet-data` | Google Sheets to CSV/TSV/ENV |
| `go-review-style` | Code style/architecture review with named agents |
| `go-review-security` | Security vulnerability review with named agents |

## Project structure

`./cmd/*` is for wiring: config, CLI flags, environment, routes, and server startup.
For non-trivial commands and servers, private implementation details go in `./internal/`.
If unsure whether something belongs in `cmd` or `internal`, ask.

## Error Handling

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